//! DuckDuckGo: general web results, read from its HTML page, with its Lite page as the fallback. It has
//! no public search API for this, so the source is best-effort and unofficial: its pages can change and
//! it can stop answering. The pacing, the request limit, the pause and the answer cache are in
//! `duckduckgo_guard`; this module builds the two requests, reads their answers and names the failures.
use super::duckduckgo_guard;
use super::{pace, Answer, SearchHit, SearchSource};
use crate::commands::tools::limits::{
    DUCKDUCKGO_MIN_INTERVAL_MS, DUCKDUCKGO_PAGE_RESULTS, DUCKDUCKGO_PAUSE_SECS, SEARCH_MAX_BYTES,
};
use crate::commands::tools::web::client::{self, WebError};
use crate::commands::tools::web::html_text::collapse_whitespace;
use dom_query::{Document, Selection};
use reqwest::{Client, StatusCode};
use std::time::Duration;
use url::Url;

const HTML_ADDRESS: &str = "https://html.duckduckgo.com/html/";
const LITE_ADDRESS: &str = "https://lite.duckduckgo.com/lite/";
const READ_FAILED: &str =
    "DuckDuckGo returned a page this app cannot read. The source may have changed.";
const NO_RESULTS_TEXT: &str = "no results";
const HUMAN_CHECK: &str = "a human check page";
/// Words (lower case) that mark a challenge or a block. They count only on a page with no results,
/// so a result that quotes one of them does not pause the source.
const CHALLENGE_MARKERS: [&str; 5] = [
    "anomaly-modal",
    "captcha",
    "unusual traffic",
    "bots use duckduckgo",
    "challenge-form",
];

/// DuckDuckGo: general web results. Best-effort, see the module text.
pub(super) struct DuckDuckGo;

impl SearchSource for DuckDuckGo {
    fn id(&self) -> &'static str {
        "duckduckgo"
    }

    fn label(&self) -> &'static str {
        "Web (DuckDuckGo)"
    }

    fn host(&self) -> &'static str {
        "duckduckgo.com"
    }

    fn description(&self) -> &'static str {
        "Good for general questions and news. Best-effort and unofficial: it reads DuckDuckGo's web pages, which are not an API, so it may stop working at any time. Your query goes to DuckDuckGo."
    }

    fn build_request(&self, _query: &str, _limit: usize) -> Result<Url, String> {
        Page::Html.url()
    }

    fn parse(&self, body: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let hits = parse_html(body, limit);
        if hits.is_empty() && !mentions_no_results(body) {
            return Err(READ_FAILED.into());
        }
        Ok(hits)
    }

    fn min_interval(&self) -> Duration {
        Duration::from_millis(DUCKDUCKGO_MIN_INTERVAL_MS)
    }

    fn ask<'a>(&'a self, client: &'a Client, query: &'a str, limit: usize) -> Answer<'a> {
        Box::pin(answer(client, query, limit))
    }
}

/// The two DuckDuckGo pages the source reads. The query is the only field sent.
#[derive(Clone, Copy)]
enum Page {
    Html,
    Lite,
}

impl Page {
    fn url(self) -> Result<Url, String> {
        let address = match self {
            Self::Html => HTML_ADDRESS,
            Self::Lite => LITE_ADDRESS,
        };
        Url::parse(address).map_err(|error| format!("The search address is not valid: {error}"))
    }

    fn parse(self, body: &str) -> Vec<SearchHit> {
        match self {
            Self::Html => parse_html(body, DUCKDUCKGO_PAGE_RESULTS),
            Self::Lite => parse_lite(body, DUCKDUCKGO_PAGE_RESULTS),
        }
    }
}

/// What a page answer says. `Unreadable` is a page with no result and no explanation: the layout may
/// have changed.
#[derive(Debug, PartialEq, Eq)]
enum Reading {
    Results(Vec<SearchHit>),
    NoResults,
    Unreadable,
}

/// Why a page answer cannot be used at all.
#[derive(Debug, PartialEq, Eq)]
enum Refusal {
    /// DuckDuckGo asks the app to stop. The text says why.
    Challenged(String),
    /// A status other than success.
    Status(StatusCode),
}

/// The hits for `query`: a stored answer when there is one, else the HTML page and, when that page
/// gave nothing to read, the Lite page. A new answer is stored. At most `limit` hits are returned.
async fn answer(client: &Client, query: &str, limit: usize) -> Result<Vec<SearchHit>, WebError> {
    let key = duckduckgo_guard::cache_key(query);
    if let Some(hits) = duckduckgo_guard::cached_answer(&key)? {
        return Ok(hits.into_iter().take(limit).collect());
    }
    let hits = search_pages(client, query).await?;
    duckduckgo_guard::store_answer(key, &hits)?;
    Ok(hits.into_iter().take(limit).collect())
}

/// The results of the HTML page, or of the Lite page when the HTML page had nothing to read.
async fn search_pages(client: &Client, query: &str) -> Result<Vec<SearchHit>, WebError> {
    match read_page(client, Page::Html, query).await? {
        Reading::Unreadable => hits_of(read_page(client, Page::Lite, query).await?),
        reading => hits_of(reading),
    }
}

/// One paced and counted request to a page, and what its answer says. A challenge pauses the source;
/// a status other than success is named by its code. Nothing is retried.
async fn read_page(client: &Client, page: Page, query: &str) -> Result<Reading, WebError> {
    duckduckgo_guard::admit_request()?;
    pace(DuckDuckGo.id(), DuckDuckGo.min_interval()).await?;
    let (status, body) = fetch_page(client, page, query).await?;
    let judged = tokio::task::spawn_blocking(move || classify_answer(page, status, &body))
        .await
        .map_err(|_| WebError::Failed(READ_FAILED.into()))?;
    match judged {
        Ok(reading) => Ok(reading),
        Err(Refusal::Challenged(reason)) => {
            duckduckgo_guard::pause_source()?;
            Err(WebError::Failed(challenged_text(&reason)))
        }
        Err(Refusal::Status(status)) => Err(WebError::Failed(format!("HTTP {}", status.as_u16()))),
    }
}

/// The status and the text of one page answer. A request that gets no answer is named after
/// DuckDuckGo, with its cause kept after the name, so the frontend reads it as offline.
async fn fetch_page(
    client: &Client,
    page: Page,
    query: &str,
) -> Result<(StatusCode, String), WebError> {
    let url = page.url().map_err(WebError::Failed)?;
    let response = client::send_form(client, url, &[("q", query)])
        .await
        .map_err(reach_error)?;
    let status = response.status();
    let body = client::read_body(response, SEARCH_MAX_BYTES)
        .await
        .map_err(reach_error)?;
    if body.cut {
        return Err(WebError::Failed(format!(
            "the answer is larger than {} KiB",
            SEARCH_MAX_BYTES / 1024
        )));
    }
    Ok((status, String::from_utf8_lossy(&body.bytes).into_owned()))
}

fn reach_error(error: WebError) -> WebError {
    match error {
        WebError::Unreachable(cause) => {
            WebError::Unreachable(format!("Failed to reach DuckDuckGo: {cause}"))
        }
        other => other,
    }
}

/// What one answer says: its status, its text and the hits read from it. Runs on the blocking pool,
/// with the parse. A result that is there wins over a marker word in its text.
fn classify_answer(page: Page, status: StatusCode, body: &str) -> Result<Reading, Refusal> {
    if matches!(status, StatusCode::ACCEPTED | StatusCode::TOO_MANY_REQUESTS) {
        return Err(Refusal::Challenged(format!("HTTP {}", status.as_u16())));
    }
    let hits = page.parse(body);
    if status.is_success() && !hits.is_empty() {
        return Ok(Reading::Results(hits));
    }
    if challenge_marker(body).is_some() {
        return Err(Refusal::Challenged(HUMAN_CHECK.into()));
    }
    if !status.is_success() {
        return Err(Refusal::Status(status));
    }
    if mentions_no_results(body) {
        Ok(Reading::NoResults)
    } else {
        Ok(Reading::Unreadable)
    }
}

/// The challenge marker a page carries, if any.
fn challenge_marker(body: &str) -> Option<&'static str> {
    let lower = body.to_ascii_lowercase();
    CHALLENGE_MARKERS
        .into_iter()
        .find(|marker| lower.contains(marker))
}

fn mentions_no_results(body: &str) -> bool {
    body.to_ascii_lowercase().contains(NO_RESULTS_TEXT)
}

/// The hits of a settled reading. A page with nothing to read is the failure that says the layout
/// may have changed.
fn hits_of(reading: Reading) -> Result<Vec<SearchHit>, WebError> {
    match reading {
        Reading::Results(hits) => Ok(hits),
        Reading::NoResults => Ok(Vec::new()),
        Reading::Unreadable => Err(WebError::Failed(READ_FAILED.into())),
    }
}

/// The failure of a challenge: why, and how long the source stays paused.
fn challenged_text(reason: &str) -> String {
    format!(
        "DuckDuckGo is limiting automated searches ({reason}). The source is paused for {}. Try again later or use another source.",
        duckduckgo_guard::minutes_text(DUCKDUCKGO_PAUSE_SECS / 60)
    )
}

/// One result as the page wrote it, before its link is checked.
struct RawHit {
    title: String,
    href: String,
    snippet: String,
}

/// The results of the HTML page: each `div.result` that is not an ad, with its title link and snippet.
fn parse_html(body: &str, limit: usize) -> Vec<SearchHit> {
    let document = Document::from(body);
    let raw: Vec<RawHit> = document
        .select("div.result")
        .iter()
        .filter(|result| !result.has_class("result--ad"))
        .filter_map(|result| {
            let link = result.select("a.result__a");
            link.exists().then(|| RawHit {
                title: collapse_whitespace(&link.text()),
                href: attribute_value(&link, "href"),
                snippet: collapse_whitespace(&result.select(".result__snippet").text()),
            })
        })
        .collect();
    collect_hits(raw, limit)
}

/// The results of the Lite page: each `a.result-link`, with the `td.result-snippet` that follows it.
fn parse_lite(body: &str, limit: usize) -> Vec<SearchHit> {
    let document = Document::from(body);
    let mut raw: Vec<RawHit> = Vec::new();
    for node in document.select("a.result-link, td.result-snippet").iter() {
        if node.is("a") {
            raw.push(RawHit {
                title: collapse_whitespace(&node.text()),
                href: attribute_value(&node, "href"),
                snippet: String::new(),
            });
        } else if let Some(last) = raw.last_mut().filter(|last| last.snippet.is_empty()) {
            last.snippet = collapse_whitespace(&node.text());
        }
    }
    collect_hits(raw, limit)
}

fn attribute_value(selection: &Selection, name: &str) -> String {
    selection
        .attr(name)
        .map(|value| value.to_string())
        .unwrap_or_default()
}

/// The hits of the raw results, in order and at most `limit`. A result needs a title and a page of its
/// own, and each page is listed once.
fn collect_hits(raw: Vec<RawHit>, limit: usize) -> Vec<SearchHit> {
    let mut hits: Vec<SearchHit> = Vec::new();
    for item in raw {
        if hits.len() == limit {
            break;
        }
        if item.title.is_empty() {
            continue;
        }
        let Some(url) = result_url(&item.href) else {
            continue;
        };
        if hits.iter().any(|hit| hit.url == url) {
            continue;
        }
        hits.push(SearchHit {
            title: item.title,
            url,
            snippet: item.snippet,
        });
    }
    hits
}

/// The page a result links to. DuckDuckGo's redirect (`/l/?uddg=...`) is unwrapped to the page it names.
/// `None` for a link that is not an http or https page outside DuckDuckGo.
fn result_url(href: &str) -> Option<String> {
    let link = Url::parse(HTML_ADDRESS).ok()?.join(href.trim()).ok()?;
    let target = if is_redirect(&link) {
        redirect_target(&link)?
    } else {
        link
    };
    let outside = !target.host_str().is_some_and(is_duckduckgo_host);
    (matches!(target.scheme(), "http" | "https") && outside).then(|| target.into())
}

fn is_duckduckgo_host(host: &str) -> bool {
    host == "duckduckgo.com" || host.ends_with(".duckduckgo.com")
}

fn is_redirect(link: &Url) -> bool {
    link.host_str().is_some_and(is_duckduckgo_host) && link.path() == "/l/"
}

/// The page a redirect names in its `uddg` parameter, decoded once by the URL parser.
fn redirect_target(link: &Url) -> Option<Url> {
    let (_, target) = link.query_pairs().find(|(key, _)| key == "uddg")?;
    Url::parse(&target).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Two results, an ad, a duplicate, a link that is not a web page and a DuckDuckGo link.
    const HTML_SAMPLE: &str = r#"<html><body><div id="links" class="results">
<div class="result results_links results_links_deep web-result ">
  <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.rust-lang.org%2F&amp;rut=abc">Rust   Programming
     Language</a></h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.rust-lang.org%2F&amp;rut=abc">A language  empowering
   everyone &amp; reliable.</a>
</div>
<div class="result results_links results_links_deep result--ad result--ad--small">
  <a class="result__a" href="//duckduckgo.com/y.js?ad_provider=x">Sponsored result</a>
  <a class="result__snippet">Buy now</a>
</div>
<div class="result"><a class="result__a" href="https://doc.rust-lang.org/book/">The Rust Book</a><a class="result__snippet">Learn   Rust.</a></div>
<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa%3Fq%3D%C3%BC%26x%3D1&amp;rut=zz">Encoded   link</a><a class="result__snippet">Percent encoded.</a></div>
<div class="result"><a class="result__a" href="https://www.rust-lang.org/">Same page again</a></div>
<div class="result"><a class="result__a" href="mailto:someone@example.org">Mail link</a></div>
<div class="result"><a class="result__a" href="javascript:void(0)">Script link</a></div>
<div class="result"><a class="result__a" href="/?q=rust&amp;ia=web">Back to search</a></div>
<div class="result"><a class="result__a" href="https://duckduckgo.com/about">About DuckDuckGo</a></div>
<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2F">Redirect to DuckDuckGo</a></div>
<div class="result"><a class="result__a" href="https://example.net/empty">   </a></div>
</div></body></html>"#;

    /// The Lite layout: a link row, then its snippet row. One result links to DuckDuckGo itself.
    const LITE_SAMPLE: &str = r#"<html><body><table>
<tr><td valign="top">1.&nbsp;</td><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.python.org%2F&amp;rut=q" class='result-link'>Python.org</a></td></tr>
<tr><td>&nbsp;</td><td class='result-snippet'>The official   home of
  the Python language.</td></tr>
<tr><td valign="top">2.&nbsp;</td><td><a rel="nofollow" href="https://docs.python.org/3/" class='result-link'>Python docs</a></td></tr>
<tr><td>&nbsp;</td><td class='result-snippet'>Reference &amp; tutorial.</td></tr>
<tr><td><a href="/?q=python" class='result-link'>Internal</a></td></tr>
<tr><td>&nbsp;</td><td class='result-snippet'>Internal snippet</td></tr>
</table></body></html>"#;

    fn hit(title: &str, url: &str, snippet: &str) -> SearchHit {
        SearchHit {
            title: title.into(),
            url: url.into(),
            snippet: snippet.into(),
        }
    }

    #[test]
    fn the_html_page_gives_titles_unwrapped_links_and_plain_snippets() {
        let hits = parse_html(HTML_SAMPLE, 10);
        assert_eq!(
            hits,
            [
                hit(
                    "Rust Programming Language",
                    "https://www.rust-lang.org/",
                    "A language empowering everyone & reliable."
                ),
                hit(
                    "The Rust Book",
                    "https://doc.rust-lang.org/book/",
                    "Learn Rust."
                ),
                hit(
                    "Encoded link",
                    "https://example.org/a?q=%C3%BC&x=1",
                    "Percent encoded."
                ),
            ]
        );
    }

    #[test]
    fn the_html_page_keeps_the_limit() {
        assert_eq!(parse_html(HTML_SAMPLE, 1).len(), 1);
        assert_eq!(parse_html(HTML_SAMPLE, 2)[1].title, "The Rust Book");
    }

    #[test]
    fn the_lite_page_pairs_each_link_with_the_snippet_after_it() {
        let hits = parse_lite(LITE_SAMPLE, 10);
        assert_eq!(
            hits,
            [
                hit(
                    "Python.org",
                    "https://www.python.org/",
                    "The official home of the Python language."
                ),
                hit(
                    "Python docs",
                    "https://docs.python.org/3/",
                    "Reference & tutorial."
                ),
            ]
        );
    }

    #[test]
    fn a_page_with_no_result_markup_gives_no_hits() {
        assert!(parse_html("<html><body><p>Hello</p></body></html>", 10).is_empty());
        assert!(parse_lite("<html><body><p>Hello</p></body></html>", 10).is_empty());
    }

    #[test]
    fn redirects_are_unwrapped_with_their_percent_encoding_and_slashes() {
        assert_eq!(
            result_url("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fa%3Fq%3D%C3%BC%26x%3D1&rut=zz")
                .as_deref(),
            Some("https://example.org/a?q=%C3%BC&x=1")
        );
        assert_eq!(
            result_url("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2F").as_deref(),
            Some("https://example.org/")
        );
    }

    #[test]
    fn direct_web_links_are_kept_as_they_are() {
        assert_eq!(
            result_url("https://doc.rust-lang.org/book/").as_deref(),
            Some("https://doc.rust-lang.org/book/")
        );
        assert_eq!(
            result_url("http://example.org/page").as_deref(),
            Some("http://example.org/page")
        );
    }

    #[test]
    fn links_that_are_not_web_pages_or_stay_on_duckduckgo_are_dropped() {
        for href in [
            "mailto:someone@example.org",
            "javascript:void(0)",
            "ftp://example.org/file",
            "/?q=rust",
            "//html.duckduckgo.com/html/",
            "https://duckduckgo.com/about",
            "",
            "//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2F",
            "//duckduckgo.com/l/?rut=no-target",
        ] {
            assert_eq!(result_url(href), None, "{href}");
        }
    }

    #[test]
    fn a_result_needs_a_title_and_is_listed_once() {
        let raw = vec![
            RawHit {
                title: String::new(),
                href: "https://example.org/untitled".into(),
                snippet: String::new(),
            },
            RawHit {
                title: "First".into(),
                href: "https://example.org/same".into(),
                snippet: "one".into(),
            },
            RawHit {
                title: "Again".into(),
                href: "https://example.org/same".into(),
                snippet: "two".into(),
            },
        ];
        assert_eq!(
            collect_hits(raw, 10),
            [hit("First", "https://example.org/same", "one")]
        );
    }

    #[test]
    fn each_challenge_marker_on_a_page_with_no_results_is_a_challenge() {
        for marker in CHALLENGE_MARKERS {
            let body = format!("<html><body><div>{marker}</div></body></html>");
            assert_eq!(challenge_marker(&body), Some(marker), "{marker}");
            assert_eq!(
                classify_answer(Page::Html, StatusCode::OK, &body),
                Err(Refusal::Challenged(HUMAN_CHECK.into())),
                "{marker}"
            );
        }
    }

    #[test]
    fn markers_are_found_in_any_case() {
        assert_eq!(
            challenge_marker("<p>Please solve the CAPTCHA</p>"),
            Some("captcha")
        );
        assert_eq!(challenge_marker("<p>Ordinary page</p>"), None);
    }

    #[test]
    fn a_page_with_results_is_read_even_when_a_result_quotes_a_marker_word() {
        let body = HTML_SAMPLE.replace(
            "Learn   Rust.",
            "Why every captcha is different and unusual traffic too.",
        );
        let Ok(Reading::Results(hits)) = classify_answer(Page::Html, StatusCode::OK, &body) else {
            panic!("results expected");
        };
        assert_eq!(hits.len(), 3);
    }

    #[test]
    fn a_status_of_202_or_429_is_a_challenge_whatever_the_body() {
        assert_eq!(
            classify_answer(Page::Html, StatusCode::ACCEPTED, HTML_SAMPLE),
            Err(Refusal::Challenged("HTTP 202".into()))
        );
        assert_eq!(
            classify_answer(Page::Lite, StatusCode::TOO_MANY_REQUESTS, ""),
            Err(Refusal::Challenged("HTTP 429".into()))
        );
    }

    #[test]
    fn a_page_that_says_there_are_no_results_is_an_empty_answer() {
        let body = "<html><body><div class='no-results'>No results.</div></body></html>";
        assert_eq!(
            classify_answer(Page::Html, StatusCode::OK, body),
            Ok(Reading::NoResults)
        );
        assert_eq!(hits_of(Reading::NoResults), Ok(Vec::new()));
    }

    #[test]
    fn a_page_with_nothing_readable_says_the_layout_may_have_changed() {
        let body = "<html><body><div class='new-layout'>Something new</div></body></html>";
        assert_eq!(
            classify_answer(Page::Html, StatusCode::OK, body),
            Ok(Reading::Unreadable)
        );
        assert_eq!(
            hits_of(Reading::Unreadable),
            Err(WebError::Failed(
                "DuckDuckGo returned a page this app cannot read. The source may have changed."
                    .into()
            ))
        );
    }

    #[test]
    fn a_status_other_than_success_without_a_marker_is_a_status_refusal() {
        assert_eq!(
            classify_answer(
                Page::Html,
                StatusCode::INTERNAL_SERVER_ERROR,
                "<html></html>"
            ),
            Err(Refusal::Status(StatusCode::INTERNAL_SERVER_ERROR))
        );
    }

    #[test]
    fn the_challenge_text_names_the_reason_and_the_pause() {
        assert_eq!(
            challenged_text("HTTP 429"),
            "DuckDuckGo is limiting automated searches (HTTP 429). The source is paused for 15 minutes. Try again later or use another source."
        );
    }

    #[test]
    fn a_request_that_gets_no_answer_names_duckduckgo_and_keeps_the_cause() {
        assert_eq!(
            reach_error(WebError::Unreachable("the request took too long".into())),
            WebError::Unreachable("Failed to reach DuckDuckGo: the request took too long".into())
        );
        assert_eq!(
            reach_error(WebError::Failed("HTTP 500".into())),
            WebError::Failed("HTTP 500".into())
        );
    }

    #[test]
    fn both_pages_are_fixed_https_addresses_on_duckduckgo() {
        for page in [Page::Html, Page::Lite] {
            let url = page.url().expect("address");
            assert_eq!(url.scheme(), "https");
            assert!(url.host_str().is_some_and(is_duckduckgo_host), "{url}");
        }
        assert_eq!(
            Page::Html.url().expect("address").host_str(),
            Some("html.duckduckgo.com")
        );
    }

    #[test]
    fn the_source_is_listed_as_unofficial_best_effort_and_names_duckduckgo() {
        let source = DuckDuckGo;
        assert_eq!(source.id(), "duckduckgo");
        assert_eq!(source.label(), "Web (DuckDuckGo)");
        assert_eq!(source.host(), "duckduckgo.com");
        assert!(source.description().starts_with("Good for "));
        for words in ["unofficial", "may stop working", "goes to DuckDuckGo"] {
            assert!(source.description().contains(words), "{words}");
        }
        assert_eq!(source.min_interval(), Duration::from_millis(5000));
    }

    #[test]
    fn the_trait_parse_reads_the_html_page_and_refuses_a_page_it_cannot_read() {
        assert_eq!(
            DuckDuckGo.parse(HTML_SAMPLE, 10).map(|hits| hits.len()),
            Ok(3)
        );
        assert_eq!(
            DuckDuckGo.parse("<html><body><p>Changed</p></body></html>", 10),
            Err(READ_FAILED.into())
        );
        assert_eq!(
            DuckDuckGo.parse("<html>No results.</html>", 10),
            Ok(Vec::new())
        );
    }

    #[tokio::test]
    async fn a_stored_answer_is_served_with_its_limit_and_no_request() {
        let query = "  DDG   Stored  Answer ";
        let key = duckduckgo_guard::cache_key(query);
        duckduckgo_guard::store_answer(
            key,
            &[
                hit("One", "https://example.org/1", ""),
                hit("Two", "https://example.org/2", ""),
            ],
        )
        .expect("store");
        let client = crate::commands::tools::web::client::web_client().expect("client");
        let hits = answer(&client, "ddg stored answer", 1)
            .await
            .expect("cached answer");
        assert_eq!(hits, [hit("One", "https://example.org/1", "")]);
    }

    /// Runs one real query on DuckDuckGo and prints the results. Not run by default: it sends a
    /// request to the site. Run with `cargo test duckduckgo -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "live: sends one real search to DuckDuckGo"]
    async fn live_query_prints_the_results() {
        let client = crate::commands::tools::web::client::web_client().expect("client");
        let hits = answer(&client, "rust programming language", 5)
            .await
            .expect("a live search");
        for (number, hit) in hits.iter().enumerate() {
            println!(
                "{}. {}\n   {}\n   {}",
                number + 1,
                hit.title,
                hit.url,
                hit.snippet
            );
        }
        assert!(!hits.is_empty(), "no results");
    }
}
