//! GitHub release lookup shared by the GenieX CLI update and the runtime installer.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::commands::constants::{GITHUB_TIMEOUT_SECS, RUNTIME_RELEASE_CACHE_SECS};

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

/// GET a release's JSON from the GitHub API.
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

/// Recently fetched releases, keyed by API URL. Only successful fetches are kept.
#[derive(Default)]
pub struct ReleaseCache {
    entries: Mutex<HashMap<String, (Instant, Release)>>,
}

impl ReleaseCache {
    /// The release at `api_url`, from the cache while it is under an hour old.
    pub async fn get_or_fetch(&self, api_url: &str, repo: &str) -> Result<Release, String> {
        if let Some(hit) = self.fresh(api_url) {
            return Ok(hit);
        }
        let json = fetch_release_json(api_url).await?;
        let release = parse_release(&json, repo)?;
        self.store(api_url, &release);
        Ok(release)
    }

    fn fresh(&self, api_url: &str) -> Option<Release> {
        // A poisoned lock only means nothing is cached; the caller then fetches again.
        let map = self.entries.lock().ok()?;
        let (fetched_at, release) = map.get(api_url)?;
        (fetched_at.elapsed() < Duration::from_secs(RUNTIME_RELEASE_CACHE_SECS))
            .then(|| release.clone())
    }

    fn store(&self, api_url: &str, release: &Release) {
        if let Ok(mut map) = self.entries.lock() {
            map.insert(api_url.to_string(), (Instant::now(), release.clone()));
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
    }
}
