//! Stack Overflow questions, through the Stack Exchange API. Its gzip answers are unpacked by the client.
use super::{endpoint, SearchHit, SearchSource};
use crate::commands::tools::web::html_text::{collapse_whitespace, decode_entities};
use serde::Deserialize;
use url::Url;

const API: &str = "https://api.stackexchange.com/2.3/search/advanced";

pub(super) struct StackOverflow;

#[derive(Deserialize)]
struct Answer {
    #[serde(default)]
    items: Vec<Item>,
    error_message: Option<String>,
}

#[derive(Deserialize)]
struct Item {
    title: String,
    link: String,
    #[serde(default)]
    score: i64,
    #[serde(default)]
    is_answered: bool,
    #[serde(default)]
    tags: Vec<String>,
}

impl SearchSource for StackOverflow {
    fn id(&self) -> &'static str {
        "stackoverflow"
    }

    fn label(&self) -> &'static str {
        "Stack Overflow"
    }

    fn host(&self) -> &'static str {
        "api.stackexchange.com"
    }

    fn description(&self) -> &'static str {
        "Good for programming questions, error messages and how-tos."
    }

    fn build_request(&self, query: &str, limit: usize) -> Result<Url, String> {
        let pagesize = limit.to_string();
        endpoint(
            API,
            &[
                ("order", "desc"),
                ("sort", "relevance"),
                ("q", query),
                ("site", "stackoverflow"),
                ("pagesize", pagesize.as_str()),
            ],
        )
    }

    fn parse(&self, body: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let answer: Answer = serde_json::from_str(body)
            .map_err(|error| format!("The response could not be read: {error}"))?;
        if answer.items.is_empty() {
            if let Some(message) = answer.error_message {
                return Err(format!("Stack Overflow reported an error: {message}"));
            }
        }
        Ok(answer
            .items
            .into_iter()
            .take(limit)
            .map(|item| SearchHit {
                title: collapse_whitespace(&decode_entities(&item.title)),
                url: item.link.trim().to_string(),
                snippet: snippet(item.score, item.is_answered, &item.tags),
            })
            .filter(|hit| !hit.title.is_empty() && !hit.url.is_empty())
            .collect())
    }
}

/// `score 12, answered, tags: rust, async-await`. The tags part is left out when there are none.
fn snippet(score: i64, answered: bool, tags: &[String]) -> String {
    let state = if answered { "answered" } else { "unanswered" };
    let mut text = format!("score {score}, {state}");
    if !tags.is_empty() {
        text.push_str(", tags: ");
        text.push_str(&tags.join(", "));
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"items":[{"tags":["rust","async-await"],"owner":{"display_name":"x"},"is_answered":true,"view_count":900,"answer_count":2,"score":12,"last_activity_date":1700000000,"creation_date":1690000000,"question_id":1,"link":"https://stackoverflow.com/questions/1/how-to-await","title":"How do I &quot;await&quot; &amp; poll a future?"},{"tags":[],"is_answered":false,"score":-1,"link":"https://stackoverflow.com/questions/2/unanswered","title":"  Two   words "}],"has_more":true,"quota_max":300,"quota_remaining":299}"#;

    #[test]
    fn the_request_names_the_query_the_site_and_the_page_size() {
        let url = StackOverflow.build_request("borrow checker", 3).expect("url");
        assert_eq!(url.host_str(), Some("api.stackexchange.com"));
        assert_eq!(url.path(), "/2.3/search/advanced");
        assert!(url.as_str().contains("q=borrow+checker"));
        assert!(url.as_str().contains("site=stackoverflow"));
        assert!(url.as_str().contains("pagesize=3"));
        assert!(url.as_str().contains("sort=relevance"));
    }

    #[test]
    fn titles_are_decoded_and_snippets_give_score_state_and_tags() {
        let hits = StackOverflow.parse(SAMPLE, 5).expect("parse");
        assert_eq!(
            hits,
            [
                SearchHit {
                    title: "How do I \"await\" & poll a future?".into(),
                    url: "https://stackoverflow.com/questions/1/how-to-await".into(),
                    snippet: "score 12, answered, tags: rust, async-await".into(),
                },
                SearchHit {
                    title: "Two words".into(),
                    url: "https://stackoverflow.com/questions/2/unanswered".into(),
                    snippet: "score -1, unanswered".into(),
                },
            ]
        );
    }

    #[test]
    fn the_limit_caps_the_hits() {
        assert_eq!(StackOverflow.parse(SAMPLE, 1).expect("parse").len(), 1);
    }

    #[test]
    fn an_api_error_in_the_body_is_reported() {
        let body = r#"{"error_id":502,"error_message":"too many requests from this IP","error_name":"throttle_violation"}"#;
        let refusal = StackOverflow.parse(body, 5).expect_err("error");
        assert!(refusal.contains("too many requests from this IP"));
    }

    #[test]
    fn no_items_is_an_empty_answer() {
        assert_eq!(StackOverflow.parse(r#"{"items":[],"has_more":false}"#, 5), Ok(Vec::new()));
    }

    #[test]
    fn empty_and_garbage_bodies_are_errors() {
        for body in ["", "\u{1f}\u{8b}\u{8}", "<!doctype html>", "{\"items\": 3"] {
            assert!(StackOverflow.parse(body, 5).is_err(), "{body:?}");
        }
    }
}
