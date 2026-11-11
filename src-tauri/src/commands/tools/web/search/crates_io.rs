//! Rust crates, through the crates.io search API.
use super::{describe, endpoint, path_url, SearchHit, SearchSource};
use serde::Deserialize;
use url::Url;

const API: &str = "https://crates.io/api/v1/crates";
const CRATE_PAGE: &str = "https://crates.io/crates/";

pub(super) struct CratesIo;

#[derive(Deserialize)]
struct Answer {
    #[serde(default)]
    crates: Vec<Item>,
    #[serde(default)]
    errors: Vec<ApiError>,
}

#[derive(Deserialize)]
struct Item {
    name: String,
    #[serde(default)]
    max_version: String,
    description: Option<String>,
}

#[derive(Deserialize)]
struct ApiError {
    #[serde(default)]
    detail: String,
}

impl SearchSource for CratesIo {
    fn id(&self) -> &'static str {
        "crates"
    }

    fn label(&self) -> &'static str {
        "crates.io"
    }

    fn host(&self) -> &'static str {
        "crates.io"
    }

    fn description(&self) -> &'static str {
        "Good for Rust crates and the versions they publish."
    }

    fn build_request(&self, query: &str, limit: usize) -> Result<Url, String> {
        let per_page = limit.to_string();
        endpoint(API, &[("q", query), ("per_page", per_page.as_str())])
    }

    fn parse(&self, body: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let answer: Answer = serde_json::from_str(body)
            .map_err(|error| format!("The response could not be read: {error}"))?;
        if answer.crates.is_empty() {
            if let Some(error) = answer.errors.into_iter().next() {
                return Err(format!("crates.io reported an error: {}", error.detail));
            }
        }
        let mut hits = Vec::new();
        for item in answer.crates.into_iter().take(limit) {
            let name = item.name.trim();
            if name.is_empty() {
                continue;
            }
            hits.push(SearchHit {
                title: name.to_string(),
                url: path_url(CRATE_PAGE, &[name])?.to_string(),
                snippet: describe(item.description.as_deref(), &item.max_version),
            });
        }
        Ok(hits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"crates":[{"id":"serde","name":"serde","updated_at":"2026-01-01T00:00:00Z","max_version":"1.0.210","description":"A generic serialization\nframework.","downloads":1000},{"id":"tokio-util","name":"tokio-util","max_version":"0.7.12","description":null}],"meta":{"total":2}}"#;

    #[test]
    fn the_request_names_the_query_and_the_page_size() {
        let url = CratesIo.build_request("async runtime", 2).expect("url");
        assert_eq!(url.host_str(), Some("crates.io"));
        assert_eq!(url.path(), "/api/v1/crates");
        assert!(url.as_str().contains("q=async+runtime"));
        assert!(url.as_str().contains("per_page=2"));
    }

    #[test]
    fn crates_link_to_their_page_and_show_their_version() {
        let hits = CratesIo.parse(SAMPLE, 5).expect("parse");
        assert_eq!(
            hits,
            [
                SearchHit {
                    title: "serde".into(),
                    url: "https://crates.io/crates/serde".into(),
                    snippet: "A generic serialization\nframework. (version 1.0.210)".into(),
                },
                SearchHit {
                    title: "tokio-util".into(),
                    url: "https://crates.io/crates/tokio-util".into(),
                    snippet: "version 0.7.12".into(),
                },
            ]
        );
    }

    #[test]
    fn the_limit_caps_the_hits() {
        assert_eq!(CratesIo.parse(SAMPLE, 1).expect("parse").len(), 1);
    }

    #[test]
    fn an_error_answer_is_reported() {
        let body = r#"{"errors":[{"detail":"rate limit exceeded"}]}"#;
        let refusal = CratesIo.parse(body, 5).expect_err("error");
        assert_eq!(refusal, "crates.io reported an error: rate limit exceeded");
    }

    #[test]
    fn no_crates_is_an_empty_answer() {
        assert_eq!(CratesIo.parse(r#"{"crates":[],"meta":{"total":0}}"#, 5), Ok(Vec::new()));
    }

    #[test]
    fn empty_and_garbage_bodies_are_errors() {
        for body in ["", "<html>Forbidden</html>", "{\"crates\":"] {
            assert!(CratesIo.parse(body, 5).is_err(), "{body:?}");
        }
    }
}
