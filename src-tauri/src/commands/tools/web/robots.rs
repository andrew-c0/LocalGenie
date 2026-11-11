//! robots.txt: a small parser for the rules that apply to LocalGenie, and an in-memory cache per
//! origin. A missing, unreadable or unparseable robots.txt allows the page. Only a read that gave
//! an answer is cached; a failed read is asked again next time.
use super::client::{self, check_destination};
use crate::commands::tools::limits::{
    MAX_REDIRECTS, ROBOTS_CACHE_SECS, ROBOTS_MAX_BYTES, ROBOTS_TIMEOUT_SECS,
};
use reqwest::{Client, StatusCode};
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use url::Url;

/// The product token LocalGenie looks for in `User-agent` lines (compared lowercase).
const PRODUCT_TOKEN: &str = "localgenie";
/// The group every crawler falls back to when no group names it.
const WILDCARD_TOKEN: &str = "*";

/// The rules of one robots.txt that apply to LocalGenie.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct Robots {
    groups: Vec<Group>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct Group {
    agents: Vec<String>,
    rules: Vec<Rule>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Rule {
    allow: bool,
    pattern: String,
}

impl Robots {
    /// Read a robots.txt body. Lines that are not `field: value` are ignored, so garbage gives no
    /// rules, which allows everything.
    pub(super) fn parse(text: &str) -> Self {
        let mut groups = Vec::new();
        let mut current: Option<Group> = None;
        let mut in_rules = false;
        for raw_line in text.lines() {
            let line = raw_line.split('#').next().unwrap_or_default().trim();
            let Some((field, value)) = line.split_once(':') else {
                continue;
            };
            let field = field.trim().to_ascii_lowercase();
            let value = value.trim();
            match field.as_str() {
                "user-agent" => {
                    if in_rules {
                        groups.extend(current.take());
                        in_rules = false;
                    }
                    current
                        .get_or_insert_with(Group::default)
                        .agents
                        .push(value.to_ascii_lowercase());
                }
                "allow" | "disallow" => {
                    let Some(group) = current.as_mut() else {
                        continue;
                    };
                    in_rules = true;
                    // An empty value allows everything, so it adds no rule.
                    if !value.is_empty() {
                        group.rules.push(Rule {
                            allow: field == "allow",
                            pattern: value.to_string(),
                        });
                    }
                }
                _ => {}
            }
        }
        groups.extend(current);
        Self { groups }
    }

    /// Whether `path` (with its query, if any) may be fetched. The longest matching rule wins; on a
    /// tie the allow rule wins; with no matching rule the path is allowed.
    pub(super) fn allows(&self, path: &str) -> bool {
        let mut best: Option<(usize, bool)> = None;
        for rule in self.applicable_rules() {
            if !pattern_matches(&rule.pattern, path) {
                continue;
            }
            let candidate = (rule.pattern.len(), rule.allow);
            best = Some(match best {
                Some(current) if !beats(candidate, current) => current,
                _ => candidate,
            });
        }
        best.is_none_or(|(_, allow)| allow)
    }

    /// The rules of the LocalGenie groups, or of the wildcard groups when none names LocalGenie.
    fn applicable_rules(&self) -> Vec<&Rule> {
        let named: Vec<&Group> = self
            .groups
            .iter()
            .filter(|group| names(group, PRODUCT_TOKEN))
            .collect();
        let selected = if named.is_empty() {
            self.groups
                .iter()
                .filter(|group| names(group, WILDCARD_TOKEN))
                .collect()
        } else {
            named
        };
        selected
            .into_iter()
            .flat_map(|group| group.rules.iter())
            .collect()
    }
}

fn names(group: &Group, token: &str) -> bool {
    group.agents.iter().any(|agent| agent == token)
}

/// Whether a rule with `candidate` (pattern length, allow) takes over from `current`.
fn beats(candidate: (usize, bool), current: (usize, bool)) -> bool {
    candidate.0 > current.0 || (candidate.0 == current.0 && candidate.1)
}

/// Whether a robots pattern matches the start of `path`. `*` matches any run of characters and a
/// trailing `$` anchors the pattern to the end of the path.
fn pattern_matches(pattern: &str, path: &str) -> bool {
    let (body, anchored_end) = match pattern.strip_suffix('$') {
        Some(body) => (body, true),
        None => (pattern, false),
    };
    let segments: Vec<&str> = body.split('*').collect();
    let Some((first, rest)) = segments.split_first() else {
        return false;
    };
    let Some(mut remaining) = path.strip_prefix(first) else {
        return false;
    };
    let Some((last, middle)) = rest.split_last() else {
        return !anchored_end || remaining.is_empty();
    };
    for segment in middle {
        match remaining.find(segment) {
            Some(index) => remaining = &remaining[index + segment.len()..],
            None => return false,
        }
    }
    if anchored_end {
        remaining.ends_with(last)
    } else {
        remaining.contains(last)
    }
}

/// The path and query of a URL, as robots rules compare them.
pub(super) fn path_and_query(url: &Url) -> String {
    match url.query() {
        Some(query) => format!("{}?{query}", url.path()),
        None => url.path().to_string(),
    }
}

/// The robots.txt of one origin, when it was read.
struct Cached {
    fetched: Instant,
    robots: Robots,
}

/// What a robots.txt read gave: rules, nothing there, or no answer at all.
enum Fetched {
    Rules(Robots),
    Missing,
    Unknown,
}

/// The robots.txt answers, per origin, for the lifetime of the app.
pub(super) struct RobotsCache {
    entries: Mutex<BTreeMap<String, Cached>>,
}

/// The shared cache of the web tools.
pub(super) static ROBOTS_CACHE: RobotsCache = RobotsCache::new();

const CACHE_TTL: Duration = Duration::from_secs(ROBOTS_CACHE_SECS);

impl RobotsCache {
    pub(super) const fn new() -> Self {
        Self {
            entries: Mutex::new(BTreeMap::new()),
        }
    }

    /// Whether the page may be fetched, using the robots.txt of its origin. Reads and caches it
    /// when no fresh answer is held. Only a lock failure is an error.
    pub(super) async fn allows(&self, client: &Client, page: &Url) -> Result<bool, String> {
        let origin = page.origin().ascii_serialization();
        let path = path_and_query(page);
        let now = Instant::now();
        if let Some(decision) = self.cached_decision(&origin, &path, now)? {
            return Ok(decision);
        }
        match fetch_rules(client, page).await {
            Fetched::Rules(robots) => {
                let allowed = robots.allows(&path);
                self.store(origin, robots, now)?;
                Ok(allowed)
            }
            Fetched::Missing => {
                self.store(origin, Robots::default(), now)?;
                Ok(true)
            }
            Fetched::Unknown => Ok(true),
        }
    }

    /// The decision from a fresh cached answer for `origin`, if there is one.
    fn cached_decision(
        &self,
        origin: &str,
        path: &str,
        now: Instant,
    ) -> Result<Option<bool>, String> {
        let entries = self.entries.lock().map_err(|_| lock_failed())?;
        Ok(entries
            .get(origin)
            .filter(|cached| now.saturating_duration_since(cached.fetched) < CACHE_TTL)
            .map(|cached| cached.robots.allows(path)))
    }

    /// Keep an answer for `origin`, and drop the ones that have gone stale.
    fn store(&self, origin: String, robots: Robots, now: Instant) -> Result<(), String> {
        let mut entries = self.entries.lock().map_err(|_| lock_failed())?;
        entries.retain(|_, cached| now.saturating_duration_since(cached.fetched) < CACHE_TTL);
        entries.insert(
            origin,
            Cached {
                fetched: now,
                robots,
            },
        );
        Ok(())
    }
}

fn lock_failed() -> String {
    "The robots.txt cache is not available.".to_string()
}

/// Read the robots.txt of the page's origin, following redirects one checked hop at a time, all
/// within the robots timeout.
async fn fetch_rules(client: &Client, page: &Url) -> Fetched {
    let Ok(robots_url) = page.join("/robots.txt") else {
        return Fetched::Unknown;
    };
    let limit = Duration::from_secs(ROBOTS_TIMEOUT_SECS);
    match tokio::time::timeout(limit, read_rules(client, robots_url)).await {
        Ok(fetched) => fetched,
        Err(_elapsed) => Fetched::Unknown,
    }
}

async fn read_rules(client: &Client, start: Url) -> Fetched {
    let mut url = start;
    for _hop in 0..=MAX_REDIRECTS {
        if check_destination(&url).is_err() {
            return Fetched::Unknown;
        }
        let Ok(response) = client::send_get(client, url.clone()).await else {
            return Fetched::Unknown;
        };
        match client::redirect_target(&url, &response) {
            Ok(Some(next)) => url = next,
            Ok(None) => return read_final(response).await,
            Err(_) => return Fetched::Unknown,
        }
    }
    Fetched::Unknown
}

async fn read_final(response: reqwest::Response) -> Fetched {
    let status = response.status();
    if status.is_success() {
        return match client::read_body(response, ROBOTS_MAX_BYTES).await {
            Ok(body) => Fetched::Rules(Robots::parse(&String::from_utf8_lossy(&body.bytes))),
            Err(_) => Fetched::Unknown,
        };
    }
    if status == StatusCode::NOT_FOUND || status == StatusCode::GONE {
        Fetched::Missing
    } else {
        Fetched::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(text: &str) -> Robots {
        Robots::parse(text)
    }

    #[test]
    fn the_localgenie_group_wins_over_the_wildcard_group() {
        let robots = parsed(
            "User-agent: *\nDisallow: /\n\nUser-agent: LocalGenie\nDisallow: /private\n",
        );
        assert!(robots.allows("/public"));
        assert!(!robots.allows("/private/x"));
    }

    #[test]
    fn the_wildcard_group_applies_when_no_group_names_localgenie() {
        let robots =
            parsed("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /tmp\n");
        assert!(!robots.allows("/tmp/file"));
        assert!(robots.allows("/docs"));
    }

    #[test]
    fn two_groups_for_localgenie_are_merged() {
        let robots = parsed(
            "User-agent: LocalGenie\nDisallow: /a\n\nUser-agent: localgenie\nDisallow: /b\n",
        );
        assert!(!robots.allows("/a"));
        assert!(!robots.allows("/b"));
        assert!(robots.allows("/c"));
    }

    #[test]
    fn a_group_with_no_rules_allows_everything_even_under_a_wildcard_block() {
        let robots = parsed("User-agent: *\nDisallow: /\n\nUser-agent: LocalGenie\nDisallow:\n");
        assert!(robots.allows("/anything"));
    }

    #[test]
    fn the_longest_matching_rule_wins() {
        let robots = parsed("User-agent: *\nDisallow: /\nAllow: /public/\n");
        assert!(robots.allows("/public/page"));
        assert!(!robots.allows("/private/page"));

        let deeper = parsed("User-agent: *\nAllow: /a\nDisallow: /a/b\n");
        assert!(!deeper.allows("/a/b/c"));
        assert!(deeper.allows("/a/c"));
    }

    #[test]
    fn on_a_tie_the_allow_rule_wins() {
        let robots = parsed("User-agent: *\nDisallow: /same\nAllow: /same\n");
        assert!(robots.allows("/same"));
    }

    #[test]
    fn wildcards_match_any_run_of_characters() {
        let robots = parsed("User-agent: *\nDisallow: /tmp*private\n");
        assert!(!robots.allows("/tmp/x/private/y"));
        assert!(!robots.allows("/tmpprivate"));
        assert!(robots.allows("/tmp/x"));
    }

    #[test]
    fn a_dollar_sign_anchors_the_end_of_the_path() {
        let robots = parsed("User-agent: *\nDisallow: /*.pdf$\n");
        assert!(!robots.allows("/files/report.pdf"));
        assert!(robots.allows("/files/report.pdf?download=1"));
        assert!(robots.allows("/files/report.pdfx"));

        let exact = parsed("User-agent: *\nDisallow: /\nAllow: /exact$\n");
        assert!(exact.allows("/exact"));
        assert!(!exact.allows("/exact2"));
    }

    #[test]
    fn a_query_is_part_of_the_path_that_is_matched() {
        let robots = parsed("User-agent: *\nDisallow: /search?\n");
        assert!(!robots.allows("/search?q=rust"));
        assert!(robots.allows("/searches"));
    }

    #[test]
    fn field_names_agents_and_comments_are_read_loosely() {
        let robots = parsed(
            "# a comment\r\nUSER-AGENT:   LOCALGENIE  # trailing comment\r\nDISALLOW: /secret\r\n",
        );
        assert!(!robots.allows("/secret"));
        assert!(robots.allows("/open"));
    }

    #[test]
    fn sitemaps_and_unknown_fields_do_not_end_a_group() {
        let robots =
            parsed("User-agent: *\nCrawl-delay: 10\nDisallow: /x\nSitemap: https://e.org/s.xml\n");
        assert!(!robots.allows("/x"));
    }

    #[test]
    fn empty_and_garbage_bodies_allow_everything() {
        for text in [
            "",
            "   \n\n",
            "<html><title>Not robots: at all</title></html>",
            "just some text without a colon",
            "Disallow: /before-any-user-agent\n",
            "\u{0}\u{1}\u{2}: \u{3}\n",
        ] {
            assert!(parsed(text).allows("/anything"), "{text:?}");
        }
    }

    #[test]
    fn pattern_matching_handles_the_edges() {
        assert!(pattern_matches("/", "/"));
        assert!(pattern_matches("/", "/anything"));
        assert!(!pattern_matches("/a", "/"));
        assert!(pattern_matches("/a$", "/a"));
        assert!(!pattern_matches("/a$", "/ab"));
        assert!(pattern_matches("*", "/anything"));
        assert!(pattern_matches("/*/z", "/x/y/z"));
        assert!(!pattern_matches("/*/z$", "/x/z/y"));
    }

    #[test]
    fn path_and_query_keeps_the_query() {
        let url = Url::parse("https://example.com/a/b?x=1").expect("url");
        assert_eq!(path_and_query(&url), "/a/b?x=1");
        let plain = Url::parse("https://example.com").expect("url");
        assert_eq!(path_and_query(&plain), "/");
    }

    #[test]
    fn a_fresh_answer_is_used_and_an_old_one_is_not() {
        let cache = RobotsCache::new();
        let start = Instant::now();
        cache
            .store(
                "https://example.com".into(),
                parsed("User-agent: *\nDisallow: /x\n"),
                start,
            )
            .expect("store");

        let within = start + Duration::from_secs(ROBOTS_CACHE_SECS - 1);
        assert_eq!(cache.cached_decision("https://example.com", "/x", within), Ok(Some(false)));

        let expired = start + Duration::from_secs(ROBOTS_CACHE_SECS);
        assert_eq!(cache.cached_decision("https://example.com", "/x", expired), Ok(None));
    }

    #[test]
    fn answers_are_kept_per_origin() {
        let cache = RobotsCache::new();
        let now = Instant::now();
        cache
            .store("https://a.example".into(), Robots::default(), now)
            .expect("store");
        assert_eq!(cache.cached_decision("https://a.example", "/", now), Ok(Some(true)));
        assert_eq!(cache.cached_decision("https://b.example", "/", now), Ok(None));
        assert_eq!(cache.cached_decision("http://a.example", "/", now), Ok(None));
    }

    #[test]
    fn storing_drops_stale_origins() {
        let cache = RobotsCache::new();
        let start = Instant::now();
        cache
            .store("https://old.example".into(), Robots::default(), start)
            .expect("store");
        let later = start + Duration::from_secs(ROBOTS_CACHE_SECS + 1);
        cache
            .store("https://new.example".into(), Robots::default(), later)
            .expect("store");
        assert_eq!(cache.cached_decision("https://old.example", "/", later), Ok(None));
        assert_eq!(cache.cached_decision("https://new.example", "/", later), Ok(Some(true)));
    }
}
