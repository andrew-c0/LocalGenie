//! GitHub release lookup shared by the GenieX CLI update and the runtime installer.

use std::collections::HashMap;
use std::future::Future;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::commands::constants::{GITHUB_TIMEOUT_SECS, RUNTIME_RELEASE_CACHE_SECS};

/// How many of a repo's newest releases to read when looking for a build. Upstream publishes
/// releases faster than the app's update check runs, so one page is enough.
const RELEASE_LIST_PAGE_SIZE: u32 = 30;

/// Build a reqwest client with the LocalGenie user agent and a total timeout.
pub(crate) fn github_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("LocalGenie/0.1")
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// API URL of a repo's latest release, or of one tag when `tag` is given.
pub fn release_api_url(repo: &str, tag: Option<&str>) -> String {
    match tag {
        Some(tag) => format!("https://api.github.com/repos/{repo}/releases/tags/{tag}"),
        None => format!("https://api.github.com/repos/{repo}/releases/latest"),
    }
}

/// API URL of a repo's most recent releases, newest first, as a JSON list.
pub fn release_list_api_url(repo: &str) -> String {
    format!("https://api.github.com/repos/{repo}/releases?per_page={RELEASE_LIST_PAGE_SIZE}")
}

/// GET a release's JSON (or a list of releases) from the GitHub API.
pub(crate) async fn fetch_release_json(api_url: &str) -> Result<serde_json::Value, String> {
    let client = github_client(GITHUB_TIMEOUT_SECS)?;
    let resp = client
        .get(api_url)
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub releases: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }
    resp.json()
        .await
        .map_err(|e| format!("Failed to parse GitHub release: {e}"))
}

/// One downloadable file of a release.
#[derive(Debug, Clone, PartialEq)]
pub struct ReleaseAsset {
    pub name: String,
    pub download_url: String,
    /// Lower-case SHA-256 hex from GitHub's `digest` field (`sha256:<hex>`), when GitHub gives one.
    pub sha256: Option<String>,
}

/// A release: its tag (without a leading `v`), its page, and its assets.
#[derive(Debug, Clone, PartialEq)]
pub struct Release {
    pub tag: String,
    pub page_url: String,
    pub assets: Vec<ReleaseAsset>,
}

/// Read a release from GitHub's JSON. `repo` is only used for the fallback page URL.
pub fn parse_release(json: &serde_json::Value, repo: &str) -> Result<Release, String> {
    let tag = json
        .get("tag_name")
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();
    if tag.is_empty() {
        return Err("GitHub release response missing tag_name".to_string());
    }
    let page_url = json
        .get("html_url")
        .and_then(|u| u.as_str())
        .map(str::to_string)
        .unwrap_or_else(|| format!("https://github.com/{repo}/releases"));
    let assets = json
        .get("assets")
        .and_then(|a| a.as_array())
        .map(|list| list.iter().filter_map(parse_asset).collect())
        .unwrap_or_default();
    Ok(Release {
        tag,
        page_url,
        assets,
    })
}

/// One entry of the release's `assets` array. Entries without a name or URL are skipped.
fn parse_asset(asset: &serde_json::Value) -> Option<ReleaseAsset> {
    let name = asset.get("name")?.as_str()?.to_string();
    let download_url = asset.get("browser_download_url")?.as_str()?.to_string();
    let sha256 = asset
        .get("digest")
        .and_then(|d| d.as_str())
        .and_then(|d| d.strip_prefix("sha256:"))
        .map(str::to_lowercase);
    Some(ReleaseAsset {
        name,
        download_url,
        sha256,
    })
}

/// Read a release list from GitHub's JSON, newest first. Drafts and prereleases are dropped, and
/// the order comes from `published_at` (or `created_at` when a release has no publish time). An
/// entry that is not a valid release is skipped rather than failing the whole list.
pub fn parse_release_list(json: &serde_json::Value, repo: &str) -> Result<Vec<Release>, String> {
    let entries = json
        .as_array()
        .ok_or_else(|| "GitHub release list is not a JSON array".to_string())?;
    let mut published: Vec<&serde_json::Value> = entries
        .iter()
        .filter(|entry| !is_draft_or_prerelease(entry))
        .collect();
    // GitHub writes timestamps as fixed-width UTC strings, so string order is time order. The
    // sort is stable, so releases with equal timestamps keep the API's order.
    published.sort_by(|a, b| release_time(b).cmp(release_time(a)));
    Ok(published
        .into_iter()
        .filter_map(|entry| parse_release(entry, repo).ok())
        .collect())
}

fn is_draft_or_prerelease(entry: &serde_json::Value) -> bool {
    let flag = |key: &str| entry.get(key).and_then(|v| v.as_bool()).unwrap_or(false);
    flag("draft") || flag("prerelease")
}

/// The publish time of a release, or its creation time when it has none. Empty when neither is set.
fn release_time(entry: &serde_json::Value) -> &str {
    ["published_at", "created_at"]
        .iter()
        .find_map(|key| entry.get(*key).and_then(|v| v.as_str()))
        .unwrap_or_default()
}

/// Recently fetched releases, keyed by a cache key (an API URL, or a repo and runtime pair). Only
/// successful loads are kept.
#[derive(Default)]
pub struct ReleaseCache {
    entries: Mutex<HashMap<String, (Instant, Release)>>,
}

impl ReleaseCache {
    /// The release stored under `key`, or the result of `load` when nothing fresh is cached. A
    /// failed load is not cached, so the next call tries again.
    pub async fn get_or_load<F, Fut>(&self, key: &str, load: F) -> Result<Release, String>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<Release, String>>,
    {
        if let Some(hit) = self.fresh(key) {
            return Ok(hit);
        }
        let release = load().await?;
        self.store(key, &release);
        Ok(release)
    }

    /// The release at one tag's `api_url`, from the cache while it is under an hour old.
    pub async fn get_or_fetch(&self, api_url: &str, repo: &str) -> Result<Release, String> {
        self.get_or_load(api_url, || async {
            let json = fetch_release_json(api_url).await?;
            parse_release(&json, repo)
        })
        .await
    }

    fn fresh(&self, key: &str) -> Option<Release> {
        // A poisoned lock only means nothing is cached; the caller then loads again.
        let map = self.entries.lock().ok()?;
        let (fetched_at, release) = map.get(key)?;
        (fetched_at.elapsed() < Duration::from_secs(RUNTIME_RELEASE_CACHE_SECS))
            .then(|| release.clone())
    }

    fn store(&self, key: &str, release: &Release) {
        if let Ok(mut map) = self.entries.lock() {
            map.insert(key.to_string(), (Instant::now(), release.clone()));
        }
    }
}

/// Compare two dotted version strings. Returns `true` if `a < b`.
pub fn version_less_than(a: &str, b: &str) -> bool {
    let parse =
        |s: &str| -> Vec<u64> { s.split('.').filter_map(|p| p.parse::<u64>().ok()).collect() };
    let (pa, pb) = (parse(a), parse(b));
    let len = pa.len().max(pb.len());
    for i in 0..len {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        if x != y {
            return x < y;
        }
    }
    false
}

/// True when `latest` should be offered over `installed`. Dotted numbers compare by value. Any
/// other tag (for example `master-1024-77b72a2`) counts as newer when it differs.
pub fn is_update(installed: &str, latest: &str) -> bool {
    if is_dotted_numeric(installed) && is_dotted_numeric(latest) {
        version_less_than(installed, latest)
    } else {
        installed != latest
    }
}

fn is_dotted_numeric(version: &str) -> bool {
    !version.is_empty() && version.split('.').all(|part| part.parse::<u64>().is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_dotted_versions() {
        assert!(version_less_than("0.3.17", "0.5.0"));
        assert!(!version_less_than("0.5.0", "0.5.0"));
        assert!(!version_less_than("1.0", "0.9.9"));
        assert!(version_less_than("0.5", "0.5.1"));
    }

    #[test]
    fn update_offered_for_newer_dotted_versions_only() {
        assert!(is_update("0.5.0", "0.5.1"));
        assert!(
            !is_update("0.5.1", "0.5.0"),
            "an installed newer version is not an update"
        );
        assert!(!is_update("1.2.3", "1.2.3"));
    }

    #[test]
    fn non_dotted_tags_are_updates_when_they_differ() {
        assert!(is_update("master-1023-aaaaaaa", "master-1024-77b72a2"));
        assert!(!is_update("master-1024-77b72a2", "master-1024-77b72a2"));
        assert!(is_update("1.2.3", "master-1024-77b72a2"));
    }

    #[test]
    fn parses_tag_page_and_digest() {
        let json = serde_json::json!({
            "tag_name": "v1.2.0",
            "html_url": "https://github.com/o/r/releases/tag/v1.2.0",
            "assets": [
                {
                    "name": "a.zip",
                    "browser_download_url": "https://github.com/o/r/releases/download/v1.2.0/a.zip",
                    "digest": "sha256:ABCDEF"
                },
                { "name": "no-url.zip" }
            ]
        });
        let release = parse_release(&json, "o/r").expect("parses");
        assert_eq!(release.tag, "1.2.0");
        assert_eq!(
            release.page_url,
            "https://github.com/o/r/releases/tag/v1.2.0"
        );
        assert_eq!(release.assets.len(), 1, "an asset without a URL is skipped");
        assert_eq!(release.assets[0].sha256.as_deref(), Some("abcdef"));
    }

    #[test]
    fn missing_tag_is_an_error_and_missing_digest_is_none() {
        assert!(parse_release(&serde_json::json!({}), "o/r").is_err());
        let json = serde_json::json!({
            "tag_name": "1.0",
            "assets": [{ "name": "a.zip", "browser_download_url": "https://x/a.zip" }]
        });
        let release = parse_release(&json, "o/r").expect("parses");
        assert_eq!(release.page_url, "https://github.com/o/r/releases");
        assert_eq!(release.assets[0].sha256, None);
    }

    fn list_entry(tag: &str, published_at: Option<&str>, flags: (bool, bool)) -> serde_json::Value {
        let mut entry = serde_json::json!({
            "tag_name": tag,
            "draft": flags.0,
            "prerelease": flags.1,
            "created_at": "2026-01-01T00:00:00Z",
            "assets": []
        });
        if let Some(published_at) = published_at {
            entry["published_at"] = serde_json::json!(published_at);
        }
        entry
    }

    #[test]
    fn release_list_skips_drafts_and_prereleases_and_sorts_newest_first() {
        let json = serde_json::json!([
            list_entry("old", Some("2026-01-05T10:00:00Z"), (false, false)),
            list_entry("draft", Some("2026-03-01T10:00:00Z"), (true, false)),
            list_entry("beta", Some("2026-02-20T10:00:00Z"), (false, true)),
            list_entry("new", Some("2026-02-01T10:00:00Z"), (false, false)),
        ]);
        let tags: Vec<String> = parse_release_list(&json, "o/r")
            .expect("parses")
            .into_iter()
            .map(|release| release.tag)
            .collect();
        assert_eq!(tags, ["new", "old"]);
    }

    #[test]
    fn release_list_falls_back_to_created_at_and_skips_bad_entries() {
        let json = serde_json::json!([
            list_entry("published", Some("2026-01-10T00:00:00Z"), (false, false)),
            { "created_at": "2026-01-20T00:00:00Z", "tag_name": "unpublished-new" },
            { "created_at": "2026-01-01T00:00:00Z" },
        ]);
        let tags: Vec<String> = parse_release_list(&json, "o/r")
            .expect("parses")
            .into_iter()
            .map(|release| release.tag)
            .collect();
        assert_eq!(tags, ["unpublished-new", "published"]);
    }

    #[test]
    fn release_list_must_be_an_array() {
        assert!(parse_release_list(&serde_json::json!({ "message": "Not Found" }), "o/r").is_err());
    }

    #[tokio::test]
    async fn cache_keeps_a_successful_load_and_not_a_failure() {
        use std::cell::Cell;
        let cache = ReleaseCache::default();
        let calls = Cell::new(0);
        let release = parse_release(&serde_json::json!({ "tag_name": "1.0" }), "o/r").expect("ok");

        let failed = cache
            .get_or_load("k", || async {
                calls.set(calls.get() + 1);
                Err::<Release, String>("offline".to_string())
            })
            .await;
        assert!(failed.is_err());

        for _ in 0..2 {
            let loaded = cache
                .get_or_load("k", || async {
                    calls.set(calls.get() + 1);
                    Ok(release.clone())
                })
                .await;
            assert_eq!(loaded.expect("loads").tag, "1.0");
        }
        assert_eq!(
            calls.get(),
            2,
            "the failure was retried, the success was cached"
        );
    }

    #[test]
    fn api_url_for_latest_and_for_a_tag() {
        assert_eq!(
            release_api_url("o/r", None),
            "https://api.github.com/repos/o/r/releases/latest"
        );
        assert_eq!(
            release_api_url("o/r", Some("1.0")),
            "https://api.github.com/repos/o/r/releases/tags/1.0"
        );
        assert_eq!(
            release_list_api_url("o/r"),
            "https://api.github.com/repos/o/r/releases?per_page=30"
        );
    }
}
