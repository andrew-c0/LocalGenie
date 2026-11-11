//! npm packages, through the public registry search.
use super::{describe, endpoint, path_url, SearchHit, SearchSource};
use serde::Deserialize;
use url::Url;

const API: &str = "https://registry.npmjs.org/-/v1/search";
const PACKAGE_PAGE: &str = "https://www.npmjs.com/package/";

pub(super) struct Npm;

#[derive(Deserialize)]
struct Answer {
    #[serde(default)]
    objects: Vec<Object>,
}

#[derive(Deserialize)]
struct Object {
    package: Package,
}

#[derive(Deserialize)]
struct Package {
    name: String,
    #[serde(default)]
    version: String,
    description: Option<String>,
}

impl SearchSource for Npm {
    fn id(&self) -> &'static str {
        "npm"
    }

    fn label(&self) -> &'static str {
        "npm"
    }

    fn host(&self) -> &'static str {
        "registry.npmjs.org"
    }

    fn description(&self) -> &'static str {
        "Good for JavaScript and Node.js packages."
    }

    fn build_request(&self, query: &str, limit: usize) -> Result<Url, String> {
        let size = limit.to_string();
        endpoint(API, &[("text", query), ("size", size.as_str())])
    }

    fn parse(&self, body: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
        let answer: Answer = serde_json::from_str(body)
            .map_err(|error| format!("The response could not be read: {error}"))?;
        let mut hits = Vec::new();
        for object in answer.objects {
            if hits.len() == limit {
                break;
            }
            let package = object.package;
            let name = package.name.trim();
            if name.is_empty() {
                continue;
            }
            let segments: Vec<&str> = name.split('/').collect();
            hits.push(SearchHit {
                title: name.to_string(),
                url: path_url(PACKAGE_PAGE, &segments)?.to_string(),
                snippet: describe(package.description.as_deref(), &package.version),
            });
        }
        Ok(hits)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"objects":[{"package":{"name":"@scope/tool","scope":"scope","version":"2.1.0","description":"A command line tool.","keywords":[]},"score":{"final":0.9},"searchScore":1200},{"package":{"name":"left-pad","version":"1.3.0","description":null}}],"total":2,"time":"now"}"#;

    #[test]
    fn the_request_names_the_text_and_the_size() {
        let url = Npm.build_request("markdown parser", 4).expect("url");
        assert_eq!(url.host_str(), Some("registry.npmjs.org"));
        assert_eq!(url.path(), "/-/v1/search");
        assert!(url.as_str().contains("text=markdown+parser"));
        assert!(url.as_str().contains("size=4"));
    }

    #[test]
    fn packages_link_to_their_page_and_show_their_version() {
        let hits = Npm.parse(SAMPLE, 5).expect("parse");
        assert_eq!(
            hits,
            [
                SearchHit {
                    title: "@scope/tool".into(),
                    url: "https://www.npmjs.com/package/@scope/tool".into(),
                    snippet: "A command line tool. (version 2.1.0)".into(),
                },
                SearchHit {
                    title: "left-pad".into(),
                    url: "https://www.npmjs.com/package/left-pad".into(),
                    snippet: "version 1.3.0".into(),
                },
            ]
        );
    }

    #[test]
    fn the_limit_caps_the_hits() {
        assert_eq!(Npm.parse(SAMPLE, 1).expect("parse").len(), 1);
    }

    #[test]
    fn no_objects_is_an_empty_answer() {
        assert_eq!(Npm.parse(r#"{"objects":[],"total":0}"#, 5), Ok(Vec::new()));
    }

    #[test]
    fn empty_and_garbage_bodies_are_errors() {
        for body in ["", "<html>503</html>", "{\"objects\":[{\"package\":3}]}"] {
            assert!(Npm.parse(body, 5).is_err(), "{body:?}");
        }
    }
}
