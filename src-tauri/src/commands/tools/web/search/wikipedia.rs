//! Wikipedia (English), through the MediaWiki search API. Each title links to its article.
use super::{endpoint, path_url, SearchHit, SearchSource};
use crate::commands::tools::web::html_text::plain_snippet;
use serde::Deserialize;
use url::Url;

const API: &str = "https://en.wikipedia.org/w/api.php";
const ARTICLES: &str = "https://en.wikipedia.org/wiki/";

pub(super) struct Wikipedia;

#[derive(Deserialize)]
struct Answer {
    query: Option<Query>,
    error: Option<ApiError>,
}

#[derive(Deserialize)]
struct Query {
    #[serde(default)]
    search: Vec<Item>,
}

#[derive(Deserialize)]
struct Item {
    title: String,
    #[serde(default)]
    snippet: String,
}

#[derive(Deserialize)]
struct ApiError {
    #[serde(default)]
    info: String,
}

impl SearchSource for Wikipedia {
    fn id(&self) -> &'static str {
        "wikipedia"
    }

    fn label(&self) -> &'static str {
        "Wikipedia"
    }

    fn host(&self) -> &'static str {
        "en.wikipedia.org"
    }

    fn description(&self) -> &'static str {
        "Good for facts, people, places, events and definitions."
    }

    fn build_request(&self, query: &str, limit: usize) -> Result<Url, String> {
        let srlimit = limit.to_string();
        endpoint(
            API,
            &[
                ("action", "query"),
                ("list", "search"),
                ("srsearch", query),
                ("srlimit", srlimit.as_str()),
                ("format", "json"),
                ("utf8", "1"),
            ],
        )
    }

    fn parse(&self, body: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let answer: Answer = serde_json::from_str(body)
            .map_err(|error| format!("The response could not be read: {error}"))?;
        if let Some(error) = answer.error {
            return Err(format!("Wikipedia reported an error: {}", error.info));
        }
        let Some(query) = answer.query else {
            return Ok(Vec::new());
        };
        let mut hits = Vec::new();
        for item in query.search {
            if hits.len() == limit {
                break;
            }
            let title = item.title.trim();
            if title.is_empty() {
                continue;
            }
            hits.push(SearchHit {
                title: title.to_string(),
                url: article_url(title)?.to_string(),
                snippet: plain_snippet(&item.snippet),
            });
        }
        Ok(hits)
    }
}

/// The article page of a title: spaces become underscores and the rest is percent-encoded.
fn article_url(title: &str) -> Result<Url, String> {
    let underscored = title.replace(' ', "_");
    path_url(ARTICLES, &[underscored.as_str()])
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"batchcomplete":"","query":{"searchinfo":{"totalhits":2},"search":[{"ns":0,"title":"Rust (programming language)","pageid":1,"size":9000,"wordcount":1000,"snippet":"<span class=\"searchmatch\">Rust</span> is a &quot;systems&quot; language &amp; more.","timestamp":"2026-01-01T00:00:00Z"},{"ns":0,"title":"Rust","pageid":2,"size":1,"wordcount":1,"snippet":"Rust may mean:"}]}}"#;

    fn query_pairs(url: &Url) -> Vec<(String, String)> {
        url.query_pairs()
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect()
    }

    #[test]
    fn the_request_names_the_search_the_limit_and_the_format() {
        let url = Wikipedia.build_request("rust lang", 3).expect("url");
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("en.wikipedia.org"));
        assert_eq!(url.path(), "/w/api.php");
        let pairs = query_pairs(&url);
        assert!(pairs.contains(&("action".into(), "query".into())));
        assert!(pairs.contains(&("list".into(), "search".into())));
        assert!(pairs.contains(&("srsearch".into(), "rust lang".into())));
        assert!(pairs.contains(&("srlimit".into(), "3".into())));
        assert!(pairs.contains(&("format".into(), "json".into())));
        assert!(pairs.contains(&("utf8".into(), "1".into())));
    }

    #[test]
    fn the_query_is_encoded_for_spaces_ampersands_and_unicode() {
        let url = Wikipedia.build_request("tom & jerry ü", 5).expect("url");
        assert!(url.as_str().contains("srsearch=tom+%26+jerry+%C3%BC"));
        let pairs = query_pairs(&url);
        assert!(pairs.contains(&("srsearch".into(), "tom & jerry ü".into())));
    }

    #[test]
    fn a_sample_answer_gives_titles_article_links_and_plain_snippets() {
        let hits = Wikipedia.parse(SAMPLE, 5).expect("parse");
        assert_eq!(
            hits,
            [
                SearchHit {
                    title: "Rust (programming language)".into(),
                    url: "https://en.wikipedia.org/wiki/Rust_(programming_language)".into(),
                    snippet: "Rust is a \"systems\" language & more.".into(),
                },
                SearchHit {
                    title: "Rust".into(),
                    url: "https://en.wikipedia.org/wiki/Rust".into(),
                    snippet: "Rust may mean:".into(),
                },
            ]
        );
    }

    #[test]
    fn the_limit_caps_the_hits() {
        assert_eq!(Wikipedia.parse(SAMPLE, 1).expect("parse").len(), 1);
    }

    #[test]
    fn article_links_percent_encode_the_title_characters_that_need_it() {
        let body = r#"{"query":{"search":[{"title":"C# & Go/Rust?","snippet":""}]}}"#;
        let hits = Wikipedia.parse(body, 5).expect("parse");
        assert_eq!(hits[0].url, "https://en.wikipedia.org/wiki/C%23_&_Go%2FRust%3F");
    }

    #[test]
    fn an_answer_with_no_results_is_empty() {
        assert_eq!(Wikipedia.parse(r#"{"batchcomplete":""}"#, 5), Ok(Vec::new()));
        assert_eq!(Wikipedia.parse(r#"{"query":{"search":[]}}"#, 5), Ok(Vec::new()));
    }

    #[test]
    fn an_api_error_is_reported_with_its_message() {
        let body = r#"{"error":{"code":"badparam","info":"Unrecognized parameter: foo"}}"#;
        let refusal = Wikipedia.parse(body, 5).expect_err("error");
        assert!(refusal.contains("Unrecognized parameter: foo"));
    }

    #[test]
    fn empty_and_garbage_bodies_are_errors() {
        for body in ["", "<html><body>Blocked</body></html>", "[1, 2", "not json"] {
            assert!(Wikipedia.parse(body, 5).is_err(), "{body:?}");
        }
    }
}
