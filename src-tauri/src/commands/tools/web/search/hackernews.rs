//! Hacker News stories, through the Algolia search API.
use super::{endpoint, SearchHit, SearchSource};
use serde::Deserialize;
use url::Url;

const API: &str = "https://hn.algolia.com/api/v1/search";
const ITEM_PAGE: &str = "https://news.ycombinator.com/item?id=";

pub(super) struct HackerNews;

#[derive(Deserialize)]
struct Answer {
    #[serde(default)]
    hits: Vec<Item>,
}

#[derive(Deserialize)]
struct Item {
    title: Option<String>,
    url: Option<String>,
    #[serde(rename = "objectID")]
    object_id: Option<String>,
    points: Option<u64>,
    num_comments: Option<u64>,
}

impl SearchSource for HackerNews {
    fn id(&self) -> &'static str {
        "hackernews"
    }

    fn label(&self) -> &'static str {
        "Hacker News"
    }

    fn host(&self) -> &'static str {
        "hn.algolia.com"
    }

    fn description(&self) -> &'static str {
        "Good for tech news, launches and discussions."
    }

    fn build_request(&self, query: &str, limit: usize) -> Result<Url, String> {
        let hits_per_page = limit.to_string();
        endpoint(
            API,
            &[
                ("query", query),
                ("hitsPerPage", hits_per_page.as_str()),
                ("tags", "story"),
            ],
        )
    }

    fn parse(&self, body: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let answer: Answer = serde_json::from_str(body)
            .map_err(|error| format!("The response could not be read: {error}"))?;
        let mut hits = Vec::new();
        for item in answer.hits {
            if hits.len() == limit {
                break;
            }
            let title = item.title.as_deref().unwrap_or_default().trim();
            if title.is_empty() {
                continue;
            }
            let link = item.url.as_deref().map(str::trim).filter(|url| !url.is_empty());
            let discussion = item.object_id.as_deref().map(|id| format!("{ITEM_PAGE}{id}"));
            let Some(url) = link.map(str::to_string).or(discussion) else {
                continue;
            };
            hits.push(SearchHit {
                title: title.to_string(),
                url,
                snippet: format!(
                    "{} points, {} comments",
                    item.points.unwrap_or(0),
                    item.num_comments.unwrap_or(0)
                ),
            });
        }
        Ok(hits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"hits":[{"title":"Show HN: A local model runner","url":"https://example.org/runner","author":"ann","points":120,"num_comments":45,"objectID":"100","created_at":"2026-01-01T00:00:00Z"},{"title":"Ask HN: Text only story","url":null,"author":"bob","points":null,"num_comments":null,"objectID":"101"},{"title":null,"url":"https://example.org/no-title","objectID":"102"}],"nbHits":3,"page":0}"#;

    #[test]
    fn the_request_names_the_query_the_limit_and_stories() {
        let url = HackerNews.build_request("gpu drivers", 4).expect("url");
        assert_eq!(url.host_str(), Some("hn.algolia.com"));
        assert_eq!(url.path(), "/api/v1/search");
        assert!(url.as_str().contains("query=gpu+drivers"));
        assert!(url.as_str().contains("hitsPerPage=4"));
        assert!(url.as_str().contains("tags=story"));
    }

    #[test]
    fn stories_keep_their_link_and_points_and_comments() {
        let hits = HackerNews.parse(SAMPLE, 5).expect("parse");
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].title, "Show HN: A local model runner");
        assert_eq!(hits[0].url, "https://example.org/runner");
        assert_eq!(hits[0].snippet, "120 points, 45 comments");
    }

    #[test]
    fn a_story_without_a_link_links_to_its_discussion() {
        let hits = HackerNews.parse(SAMPLE, 5).expect("parse");
        assert_eq!(hits[1].url, "https://news.ycombinator.com/item?id=101");
        assert_eq!(hits[1].snippet, "0 points, 0 comments");
    }

    #[test]
    fn the_limit_caps_the_hits() {
        assert_eq!(HackerNews.parse(SAMPLE, 1).expect("parse").len(), 1);
    }

    #[test]
    fn no_hits_is_an_empty_answer() {
        assert_eq!(HackerNews.parse(r#"{"hits":[]}"#, 5), Ok(Vec::new()));
        assert_eq!(HackerNews.parse("{}", 5), Ok(Vec::new()));
    }

    #[test]
    fn empty_and_garbage_bodies_are_errors() {
        for body in ["", "<html>Too many requests</html>", "{\"hits\":", "null x"] {
            assert!(HackerNews.parse(body, 5).is_err(), "{body:?}");
        }
    }
}
