//! `web_search`: public sources, one adapter per site. A source is pure: it builds its request
//! address and parses its answer. This module does the I/O (paced, timed, size-capped, limited to the
//! source's own host), picks the sources and merges their answers into the numbered list the model reads.
mod crates_io;
mod hackernews;
mod npm;
mod stackoverflow;
mod wikipedia;

use super::client::{self, WebError, OFFLINE_PREFIX};
use crate::commands::tools::limits::{
    SEARCH_MAX_BYTES, SEARCH_MIN_INTERVAL_MS, SEARCH_TIMEOUT_SECS, SNIPPET_MAX_CHARS,
};
use crate::commands::tools::output::{capped_output, shorten_chars};
use crate::commands::tools::ToolOutput;
use reqwest::{Client, StatusCode};
use serde::Serialize;
use std::collections::BTreeMap;
use std::future::Future;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use url::Url;

const NONE_TURNED_ON: &str = "No search source is turned on in Settings > Tools.";
const PACING_UNAVAILABLE: &str = "The search pacing is not available.";

/// One result of a source: its title, the page it links to and a short snippet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

/// One public source of `web_search`.
pub(super) trait SearchSource: Sync {
    /// The id the model and the settings use.
    fn id(&self) -> &'static str;
    /// The name shown to people and used as the heading of the results.
    fn label(&self) -> &'static str;
    /// The only host the source's requests may go to.
    fn host(&self) -> &'static str;
    /// What the source is good for, one short line.
    fn description(&self) -> &'static str;
    /// The HTTPS address of the search request for `query`, with at most `limit` results.
    fn build_request(&self, query: &str, limit: usize) -> Result<Url, String>;
    /// The hits in an answer body, at most `limit`. A body that is not an answer is an error.
    fn parse(&self, body: &str, limit: usize) -> Result<Vec<SearchHit>, String>;
}

/// A source as the settings screen lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSourceInfo {
    pub id: String,
    pub label: String,
    pub host: String,
    pub description: String,
}

/// Every source, in the order they are listed and searched.
fn all() -> [&'static dyn SearchSource; 5] {
    [
        &wikipedia::Wikipedia,
        &hackernews::HackerNews,
        &stackoverflow::StackOverflow,
        &npm::Npm,
        &crates_io::CratesIo,
    ]
}

/// The ids of every source, in order.
pub(in crate::commands::tools) fn source_ids() -> Vec<&'static str> {
    all().iter().map(|source| source.id()).collect()
}

/// The sources for the settings screen.
pub(in crate::commands::tools) fn source_infos() -> Vec<SearchSourceInfo> {
    all()
        .iter()
        .map(|source| SearchSourceInfo {
            id: source.id().to_string(),
            label: source.label().to_string(),
            host: source.host().to_string(),
            description: source.description().to_string(),
        })
        .collect()
}

/// The sources a call may use: all the enabled ones, or the one named by `requested`, which must be
/// enabled. A list with no enabled source is refused.
pub(super) fn plan(
    requested: Option<&str>,
    enabled: &[String],
) -> Result<Vec<&'static dyn SearchSource>, String> {
    let turned_on: Vec<&'static dyn SearchSource> = all()
        .into_iter()
        .filter(|source| enabled.iter().any(|id| id.as_str() == source.id()))
        .collect();
    if turned_on.is_empty() {
        return Err(NONE_TURNED_ON.into());
    }
    let Some(id) = requested else {
        return Ok(turned_on);
    };
    if let Some(source) = turned_on.iter().find(|source| source.id() == id) {
        return Ok(vec![*source]);
    }
    if all().iter().any(|source| source.id() == id) {
        let on: Vec<&str> = turned_on.iter().map(|source| source.id()).collect();
        return Err(format!(
            "The source '{id}' is not turned on. Turned on: {}.",
            on.join(", ")
        ));
    }
    Err(format!(
        "Unknown search source '{id}'. The sources are: {}.",
        source_ids().join(", ")
    ))
}

/// When each source may next be asked. Shared by every call in the app.
static NEXT_REQUEST: Mutex<BTreeMap<&'static str, Instant>> = Mutex::new(BTreeMap::new());

/// How long to wait before a request, and when the next one may start. Pure, so the pacing is tested
/// without sleeping: a request starts at `next_free` or now, whichever is later, and the next one
/// may start `gap` after that.
fn reserve_slot(
    next_free: Option<Instant>,
    now: Instant,
    gap: Duration,
) -> (Duration, Instant) {
    let start = match next_free {
        Some(time) if time > now => time,
        _ => now,
    };
    let next = start.checked_add(gap).unwrap_or(start);
    (start.saturating_duration_since(now), next)
}

/// Wait until the source's minimum interval since its last request has passed.
async fn pace(source_id: &'static str) -> Result<(), WebError> {
    let gap = Duration::from_millis(SEARCH_MIN_INTERVAL_MS);
    let wait = {
        let mut next_free = NEXT_REQUEST
            .lock()
            .map_err(|_| WebError::Failed(PACING_UNAVAILABLE.into()))?;
        let (wait, next) = reserve_slot(next_free.get(source_id).copied(), Instant::now(), gap);
        next_free.insert(source_id, next);
        wait
    };
    if !wait.is_zero() {
        tokio::time::sleep(wait).await;
    }
    Ok(())
}

/// Ask one source. The request goes only to the source's own HTTPS host; the wait, the request, the
/// body and the parse share one timeout.
pub(super) async fn query_source(
    client: &Client,
    source: &dyn SearchSource,
    query: &str,
    limit: usize,
) -> Result<Vec<SearchHit>, WebError> {
    let url = source.build_request(query, limit).map_err(WebError::Failed)?;
    if url.scheme() != "https" || url.host_str() != Some(source.host()) {
        return Err(WebError::Failed(format!(
            "The {} search address is not one of its fixed addresses.",
            source.label()
        )));
    }
    pace(source.id()).await?;
    let limit_time = Duration::from_secs(SEARCH_TIMEOUT_SECS);
    let body = match tokio::time::timeout(limit_time, fetch_body(client, url)).await {
        Ok(result) => result?,
        Err(_elapsed) => {
            return Err(WebError::Unreachable("the request took too long".into()));
        }
    };
    source.parse(&body, limit).map_err(WebError::Failed)
}

/// The body of a successful search response, capped. A non-success status is named by its code.
async fn fetch_body(client: &Client, url: Url) -> Result<String, WebError> {
    let response = client::send_get(client, url).await?;
    let status = response.status();
    if status == StatusCode::TOO_MANY_REQUESTS {
        return Err(WebError::Failed(
            "the service is rate limited (HTTP 429)".into(),
        ));
    }
    if !status.is_success() {
        return Err(WebError::Failed(format!("HTTP {}", status.as_u16())));
    }
    let body = client::read_body(response, SEARCH_MAX_BYTES).await?;
    if body.cut {
        return Err(WebError::Failed(format!(
            "the answer is larger than {} KiB",
            SEARCH_MAX_BYTES / 1024
        )));
    }
    Ok(String::from_utf8_lossy(&body.bytes).into_owned())
}

/// What one source gave: its label and its answer or its failure.
#[derive(Debug)]
pub(super) struct Outcome {
    pub(super) label: &'static str,
    pub(super) result: Result<Vec<SearchHit>, WebError>,
}

/// Ask each source in turn with `ask`. When nothing has answered yet and a source cannot be
/// reached, the rest are not asked: a site that does not answer now will not answer the next one.
pub(super) async fn search_all<F, Fut>(
    sources: &[&'static dyn SearchSource],
    mut ask: F,
) -> Vec<Outcome>
where
    F: FnMut(&'static dyn SearchSource) -> Fut,
    Fut: Future<Output = Result<Vec<SearchHit>, WebError>>,
{
    let mut outcomes = Vec::with_capacity(sources.len());
    let mut answered = false;
    for source in sources {
        let result = ask(*source).await;
        let stop = !answered && matches!(result, Err(WebError::Unreachable(_)));
        answered |= result.is_ok();
        outcomes.push(Outcome {
            label: source.label(),
            result,
        });
        if stop {
            break;
        }
    }
    outcomes
}

/// The numbered list the model reads: one group per source, numbered across the groups. A source
/// with no hits or a failure is one line. When nothing answered and the last source could not be
/// reached, the result is the offline failure instead.
pub(super) fn merged_output(outcomes: &[Outcome]) -> Result<ToolOutput, String> {
    let answered = outcomes.iter().any(|outcome| outcome.result.is_ok());
    if !answered {
        if let Some(Outcome {
            label,
            result: Err(WebError::Unreachable(reason)),
        }) = outcomes.last()
        {
            return Err(format!(
                "{OFFLINE_PREFIX} {label} did not answer ({reason})."
            ));
        }
    }

    let mut lines: Vec<String> = Vec::new();
    let mut number = 0;
    for (index, outcome) in outcomes.iter().enumerate() {
        if index > 0 {
            lines.push(String::new());
        }
        let label = outcome.label;
        match &outcome.result {
            Ok(hits) if !hits.is_empty() => {
                lines.push(label.to_string());
                for hit in hits {
                    number += 1;
                    lines.extend(hit_lines(number, hit));
                }
            }
            Ok(_) => lines.push(format!("{label}: no results.")),
            Err(WebError::Unreachable(reason)) => {
                lines.push(format!("{label}: could not reach the site ({reason})."));
            }
            Err(WebError::Failed(message)) => {
                lines.push(format!("{label}: the search failed ({message})."));
            }
        }
    }
    Ok(capped_output(&lines.join("\n"), false))
}

/// The lines of one hit: `1. Title`, its address, and its snippet when it has one.
fn hit_lines(number: usize, hit: &SearchHit) -> Vec<String> {
    let mut lines = vec![format!("{number}. {}", hit.title), format!("   {}", hit.url)];
    if !hit.snippet.is_empty() {
        lines.push(format!(
            "   {}",
            shorten_chars(&hit.snippet, SNIPPET_MAX_CHARS)
        ));
    }
    lines
}

/// The address `endpoint` built from a base and query parameters. Values are encoded by the URL
/// crate's query serializer.
pub(super) fn endpoint(base: &str, params: &[(&str, &str)]) -> Result<Url, String> {
    let mut url = Url::parse(base)
        .map_err(|error| format!("The search address is not valid: {error}"))?;
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in params {
            query.append_pair(key, value);
        }
    }
    Ok(url)
}

/// The address made of a base and path segments, each percent-encoded by the URL crate.
pub(super) fn path_url(base: &str, segments: &[&str]) -> Result<Url, String> {
    let mut url = Url::parse(base)
        .map_err(|error| format!("The page address is not valid: {error}"))?;
    {
        let mut path = url
            .path_segments_mut()
            .map_err(|()| "The page address cannot take a path.".to_string())?;
        path.pop_if_empty().extend(segments);
    }
    Ok(url)
}

/// The description of a package: its text and its version, in one line.
pub(super) fn describe(description: Option<&str>, version: &str) -> String {
    let text = description.map(str::trim).unwrap_or_default();
    match (text.is_empty(), version.is_empty()) {
        (true, true) => String::new(),
        (true, false) => format!("version {version}"),
        (false, true) => text.to_string(),
        (false, false) => format!("{text} (version {version})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::tools::web::client::web_client;
    use std::str::FromStr;

    fn enabled(ids: &[&str]) -> Vec<String> {
        ids.iter().map(|id| (*id).to_string()).collect()
    }

    fn hit(title: &str, snippet: &str) -> SearchHit {
        SearchHit {
            title: title.into(),
            url: format!("https://example.test/{}", title.replace(' ', "_")),
            snippet: snippet.into(),
        }
    }

    fn ok(label: &'static str, hits: Vec<SearchHit>) -> Outcome {
        Outcome {
            label,
            result: Ok(hits),
        }
    }

    #[test]
    fn the_sources_have_the_ids_and_order_the_settings_expect() {
        assert_eq!(
            source_ids(),
            ["wikipedia", "hackernews", "stackoverflow", "npm", "crates"]
        );
        let infos = source_infos();
        assert_eq!(infos.len(), 5);
        assert_eq!(infos[0].label, "Wikipedia");
        assert_eq!(infos[0].host, "en.wikipedia.org");
        for info in &infos {
            assert!(info.description.starts_with("Good for "), "{}", info.description);
        }
    }

    #[test]
    fn source_info_serializes_with_camel_case_keys() {
        let json = serde_json::to_value(&source_infos()[0]).expect("serialize");
        assert_eq!(json["id"], "wikipedia");
        assert_eq!(json["label"], "Wikipedia");
        assert_eq!(json["host"], "en.wikipedia.org");
        assert!(json["description"].is_string());
    }

    #[test]
    fn no_enabled_source_is_refused_with_the_settings_message() {
        assert_eq!(plan(None, &[]).err().as_deref(), Some(NONE_TURNED_ON));
        assert_eq!(
            plan(Some("npm"), &enabled(&["not-a-source"])).err().as_deref(),
            Some(NONE_TURNED_ON)
        );
    }

    #[test]
    fn without_a_source_all_enabled_sources_are_planned_in_list_order() {
        let planned = plan(None, &enabled(&["npm", "wikipedia", "bogus"])).expect("plan");
        let ids: Vec<&str> = planned.iter().map(|source| source.id()).collect();
        assert_eq!(ids, ["wikipedia", "npm"]);
    }

    #[test]
    fn a_named_source_must_be_enabled_and_the_refusal_names_the_enabled_ones() {
        let planned = plan(Some("npm"), &enabled(&["wikipedia", "npm"])).expect("plan");
        assert_eq!(planned.len(), 1);
        assert_eq!(planned[0].id(), "npm");

        let refusal = plan(Some("npm"), &enabled(&["wikipedia"])).err().expect("disabled");
        assert_eq!(refusal, "The source 'npm' is not turned on. Turned on: wikipedia.");
    }

    #[test]
    fn an_unknown_source_is_refused_with_the_known_ones() {
        let refusal = plan(Some("bing"), &enabled(&["wikipedia"])).err().expect("unknown");
        assert_eq!(
            refusal,
            "Unknown search source 'bing'. The sources are: wikipedia, hackernews, stackoverflow, npm, crates."
        );
    }

    #[test]
    fn the_first_request_of_a_source_does_not_wait() {
        let now = Instant::now();
        let gap = Duration::from_millis(1100);
        let (wait, next) = reserve_slot(None, now, gap);
        assert!(wait.is_zero());
        assert_eq!(next, now + gap);
    }

    #[test]
    fn a_request_within_the_gap_waits_for_the_rest_of_it() {
        let now = Instant::now();
        let gap = Duration::from_millis(1100);
        let busy_until = now + Duration::from_millis(500);
        let (wait, next) = reserve_slot(Some(busy_until), now, gap);
        assert_eq!(wait, Duration::from_millis(500));
        assert_eq!(next, busy_until + gap);
    }

    #[test]
    fn a_gap_that_has_passed_costs_no_wait() {
        let now = Instant::now();
        let gap = Duration::from_millis(1100);
        let long_ago = now.checked_sub(Duration::from_secs(5)).unwrap_or(now);
        let (wait, next) = reserve_slot(Some(long_ago), now, gap);
        assert!(wait.is_zero());
        assert_eq!(next, now + gap);
    }

    #[test]
    fn endpoints_encode_spaces_ampersands_and_unicode() {
        let url = endpoint(
            "https://example.test/api",
            &[("q", "a & b/ü c"), ("n", "5")],
        )
        .expect("url");
        let pairs: Vec<(String, String)> = url
            .query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect();
        assert_eq!(
            pairs,
            [
                ("q".to_string(), "a & b/ü c".to_string()),
                ("n".to_string(), "5".to_string())
            ]
        );
        assert!(!url.as_str().contains(' '));
        assert!(url.as_str().contains("a+%26+b%2F%C3%BC+c"));
    }

    #[test]
    fn path_segments_encode_spaces_and_question_marks() {
        let url = path_url("https://example.test/wiki/", &["Tom & Jerry?"]).expect("url");
        assert_eq!(url.as_str(), "https://example.test/wiki/Tom%20&%20Jerry%3F");
        let unicode = path_url("https://example.test/wiki/", &["Zürich"]).expect("url");
        assert_eq!(unicode.as_str(), "https://example.test/wiki/Z%C3%BCrich");
    }

    #[test]
    fn scoped_package_names_keep_their_slash_between_segments() {
        let url = path_url("https://www.npmjs.com/package/", &["@scope", "tool"]).expect("url");
        assert_eq!(url.as_str(), "https://www.npmjs.com/package/@scope/tool");
    }

    #[test]
    fn describe_joins_the_text_and_the_version() {
        assert_eq!(describe(Some(" A tool. "), "1.2.0"), "A tool. (version 1.2.0)");
        assert_eq!(describe(None, "1.2.0"), "version 1.2.0");
        assert_eq!(describe(Some("Only text"), ""), "Only text");
        assert_eq!(describe(None, ""), "");
    }

    #[test]
    fn merged_output_groups_by_source_and_numbers_across_groups() {
        let outcomes = [
            ok("Wikipedia", vec![hit("Rust", "A language.")]),
            ok("npm", vec![hit("left-pad", ""), hit("chalk", "Colors.")]),
        ];
        let output = merged_output(&outcomes).expect("merged");
        assert_eq!(
            output.content,
            "Wikipedia\n1. Rust\n   https://example.test/Rust\n   A language.\n\nnpm\n2. left-pad\n   https://example.test/left-pad\n3. chalk\n   https://example.test/chalk\n   Colors."
        );
        assert!(!output.truncated);
    }

    #[test]
    fn a_source_with_nothing_or_a_failure_is_one_line() {
        let outcomes = [
            ok("Wikipedia", vec![]),
            Outcome {
                label: "Hacker News",
                result: Err(WebError::Failed("HTTP 503".into())),
            },
            ok("npm", vec![hit("chalk", "")]),
        ];
        let output = merged_output(&outcomes).expect("merged");
        let lines: Vec<&str> = output.content.lines().collect();
        assert_eq!(lines[0], "Wikipedia: no results.");
        assert_eq!(lines[2], "Hacker News: the search failed (HTTP 503).");
        assert_eq!(lines[4], "npm");
        assert_eq!(lines[5], "1. chalk");
    }

    #[test]
    fn a_source_that_could_not_be_reached_is_one_line_when_others_answered() {
        let outcomes = [
            ok("npm", vec![hit("chalk", "")]),
            Outcome {
                label: "crates.io",
                result: Err(WebError::Unreachable("the request took too long".into())),
            },
        ];
        let output = merged_output(&outcomes).expect("merged");
        assert!(output
            .content
            .ends_with("crates.io: could not reach the site (the request took too long)."));
    }

    #[test]
    fn nothing_answering_and_the_last_source_unreachable_is_the_offline_failure() {
        let outcomes = [Outcome {
            label: "Wikipedia",
            result: Err(WebError::Unreachable("the request took too long".into())),
        }];
        let refusal = merged_output(&outcomes).expect_err("offline");
        assert_eq!(
            refusal,
            "Could not reach the web: Wikipedia did not answer (the request took too long)."
        );
    }

    #[test]
    fn failures_without_an_unreachable_source_are_still_a_result() {
        let outcomes = [Outcome {
            label: "npm",
            result: Err(WebError::Failed("HTTP 500".into())),
        }];
        let output = merged_output(&outcomes).expect("merged");
        assert_eq!(output.content, "npm: the search failed (HTTP 500).");
    }

    #[test]
    fn long_snippets_are_cut_to_the_snippet_limit() {
        let long = "é".repeat(SNIPPET_MAX_CHARS + 50);
        let outcomes = [ok("npm", vec![hit("pkg", &long)])];
        let output = merged_output(&outcomes).expect("merged");
        let snippet = output.content.lines().last().expect("snippet line");
        assert_eq!(snippet.trim_start().chars().count(), SNIPPET_MAX_CHARS);
        assert!(snippet.trim_start().ends_with("..."));
    }

    #[test]
    fn a_long_merged_list_is_capped_with_the_usual_note() {
        let hits: Vec<SearchHit> = (0..15)
            .map(|index| hit(&format!("title {index}"), &"s".repeat(SNIPPET_MAX_CHARS)))
            .collect();
        let outcomes = [ok("npm", hits.clone()), ok("crates.io", hits)];
        let output = merged_output(&outcomes).expect("merged");
        assert!(output.truncated);
        assert!(output.content.contains("[truncated: showing 8000 of"));
    }

    #[test]
    fn a_source_called_with_an_empty_answer_loop_stops_at_an_unreachable_site() {
        let sources = all();
        let mut asked = 0;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime");
        let outcomes = runtime.block_on(search_all(&sources, |_source| {
            asked += 1;
            std::future::ready(Err(WebError::Unreachable("no route".into())))
        }));
        assert_eq!(asked, 1);
        assert_eq!(outcomes.len(), 1);
    }

    #[test]
    fn a_source_with_no_hits_does_not_stop_the_others() {
        let sources = all();
        let mut asked = 0;
        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime");
        let outcomes = runtime.block_on(search_all(&sources[..3], |source| {
            asked += 1;
            if source.id() == "wikipedia" {
                std::future::ready(Ok(Vec::new()))
            } else {
                std::future::ready(Err(WebError::Unreachable("no route".into())))
            }
        }));
        assert_eq!(asked, 3);
        assert_eq!(outcomes.len(), 3);
    }

    /// A source whose request goes somewhere other than its own host.
    struct Elsewhere {
        url: &'static str,
    }

    impl SearchSource for Elsewhere {
        fn id(&self) -> &'static str {
            "elsewhere"
        }
        fn label(&self) -> &'static str {
            "Elsewhere"
        }
        fn host(&self) -> &'static str {
            "example.test"
        }
        fn description(&self) -> &'static str {
            "Good for tests."
        }
        fn build_request(&self, _query: &str, _limit: usize) -> Result<Url, String> {
            Url::from_str(self.url).map_err(|error| error.to_string())
        }
        fn parse(&self, _body: &str, _limit: usize) -> Result<Vec<SearchHit>, String> {
            Ok(Vec::new())
        }
    }

    #[tokio::test]
    async fn a_request_to_another_host_or_scheme_is_refused_before_it_is_sent() {
        let client = web_client().expect("client");
        for url in ["https://evil.example.org/search", "http://example.test/search"] {
            let source = Elsewhere { url };
            let refusal = query_source(&client, &source, "rust", 3)
                .await
                .expect_err("refused");
            assert!(
                matches!(
                    &refusal,
                    WebError::Failed(message) if message.contains("fixed addresses")
                ),
                "{url}: {refusal:?}"
            );
        }
    }

    #[tokio::test]
    async fn a_source_that_cannot_build_its_address_is_a_failure() {
        struct Broken;
        impl SearchSource for Broken {
            fn id(&self) -> &'static str {
                "broken"
            }
            fn label(&self) -> &'static str {
                "Broken"
            }
            fn host(&self) -> &'static str {
                "example.test"
            }
            fn description(&self) -> &'static str {
                "Good for nothing."
            }
            fn build_request(&self, _query: &str, _limit: usize) -> Result<Url, String> {
                Err("no address".into())
            }
            fn parse(&self, _body: &str, _limit: usize) -> Result<Vec<SearchHit>, String> {
                Ok(Vec::new())
            }
        }
        let client = web_client().expect("client");
        let refusal = query_source(&client, &Broken, "rust", 3).await.expect_err("broken");
        assert_eq!(refusal, WebError::Failed("no address".into()));
    }
}
