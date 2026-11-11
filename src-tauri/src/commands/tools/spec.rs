use super::web::search;
use serde::Serialize;

/// Name of the tool that lists a folder.
pub const LIST_DIRECTORY: &str = "list_directory";
/// Name of the tool that reads a text file.
pub const READ_TEXT_FILE: &str = "read_text_file";
/// Name of the tool that hands an image file to the model.
pub const READ_IMAGE: &str = "read_image";
/// Name of the tool that downloads a web page or text file.
pub const WEB_FETCH: &str = "web_fetch";
/// Name of the tool that searches the public sources.
pub const WEB_SEARCH: &str = "web_search";

/// How much a tool can do. File tools only read; web tools reach the network.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolRisk {
    Read,
    Network,
}

/// Where a tool comes from. Only `Native` (implemented in Rust) exists so far.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolSource {
    Native,
}

/// One tool the model may be offered. `parameters` is a JSON schema object.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolSpec {
    pub id: String,
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
    pub risk: ToolRisk,
    pub source: ToolSource,
}

impl ToolSpec {
    fn native(
        name: &str,
        risk: ToolRisk,
        description: &str,
        parameters: serde_json::Value,
    ) -> Self {
        Self {
            id: name.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            parameters,
            risk,
            source: ToolSource::Native,
        }
    }
}

/// Schema for a tool that takes one `path` string. `required` lists `path` when it must be given.
fn path_parameters(path_description: &str, required: &[&str]) -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": { "type": "string", "description": path_description }
        },
        "required": required
    })
}

/// Schema of `web_fetch`: a `url` and an optional character offset.
fn web_fetch_parameters() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The full http or https address of the page or text file."
            },
            "start": {
                "type": "integer",
                "minimum": 0,
                "default": 0,
                "description": "Character offset to start reading from. Use the start value the last result gave to read on."
            }
        },
        "required": ["url"]
    })
}

/// Schema of `web_search`. `source` lists every source id; the caller narrows it to the enabled ones.
fn web_search_parameters(source_ids: &[&str]) -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "What to search for. Short keywords work best."
            },
            "source": {
                "type": "string",
                "enum": source_ids,
                "description": "One source to search. Leave out to search every source the user turned on."
            },
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 10,
                "default": 5,
                "description": "Most results per source, from 1 to 10."
            }
        },
        "required": ["query"]
    })
}

/// Every native tool, in the order the UI lists them.
pub(super) fn registry() -> Vec<ToolSpec> {
    vec![
        ToolSpec::native(
            LIST_DIRECTORY,
            ToolRisk::Read,
            "List the files and folders in a folder the user allowed. Returns name, kind (file or folder) and size for each entry.",
            path_parameters(
                "The full path of the folder to list. Leave out to list the folders you may read.",
                &[],
            ),
        ),
        ToolSpec::native(
            READ_TEXT_FILE,
            ToolRisk::Read,
            "Read a text file from a folder the user allowed. Returns the file text; long files are cut.",
            path_parameters("The full path of the text file to read.", &["path"]),
        ),
        ToolSpec::native(
            READ_IMAGE,
            ToolRisk::Read,
            "Look at an image file from a folder the user allowed. The image is shown to you after this call. Supports png, jpg, jpeg, gif and webp.",
            path_parameters("The full path of the image file.", &["path"]),
        ),
        ToolSpec::native(
            WEB_FETCH,
            ToolRisk::Network,
            "Download a web page or text file and return its readable text. Use `start` to continue a long page.",
            web_fetch_parameters(),
        ),
        ToolSpec::native(
            WEB_SEARCH,
            ToolRisk::Network,
            "Search public sources: Wikipedia, Hacker News, Stack Overflow, npm and crates.io. It is not a general web search; for news and general questions it often finds nothing.",
            web_search_parameters(&search::source_ids()),
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The registered spec with this name. Panics only inside a test, when the name is missing.
    fn spec_named(name: &str) -> ToolSpec {
        registry()
            .into_iter()
            .find(|spec| spec.name == name)
            .expect("registered tool")
    }

    /// The names of the required arguments of a spec.
    fn required_of(spec: &ToolSpec) -> Vec<&str> {
        spec.parameters["required"]
            .as_array()
            .map(|values| values.iter().filter_map(serde_json::Value::as_str).collect())
            .unwrap_or_default()
    }

    #[test]
    fn registry_lists_the_file_tools_then_the_web_tools() {
        let specs = registry();
        let names: Vec<&str> = specs.iter().map(|spec| spec.name.as_str()).collect();
        assert_eq!(
            names,
            [LIST_DIRECTORY, READ_TEXT_FILE, READ_IMAGE, WEB_FETCH, WEB_SEARCH]
        );
        for spec in &specs {
            assert_eq!(spec.id, spec.name);
            assert_eq!(spec.source, ToolSource::Native);
        }
    }

    #[test]
    fn file_tools_are_read_and_web_tools_are_network() {
        for name in [LIST_DIRECTORY, READ_TEXT_FILE, READ_IMAGE] {
            assert_eq!(spec_named(name).risk, ToolRisk::Read, "{name}");
        }
        for name in [WEB_FETCH, WEB_SEARCH] {
            assert_eq!(spec_named(name).risk, ToolRisk::Network, "{name}");
        }
    }

    #[test]
    fn each_tool_requires_its_first_argument() {
        assert_eq!(required_of(&spec_named(READ_TEXT_FILE)), ["path"]);
        assert_eq!(required_of(&spec_named(READ_IMAGE)), ["path"]);
        assert_eq!(required_of(&spec_named(WEB_FETCH)), ["url"]);
        assert_eq!(required_of(&spec_named(WEB_SEARCH)), ["query"]);
    }

    #[test]
    fn list_directory_takes_no_required_argument() {
        let list = spec_named(LIST_DIRECTORY);
        assert!(required_of(&list).is_empty());
        assert!(list.parameters["properties"]["path"]["description"]
            .as_str()
            .is_some_and(|text| text.contains("Leave out to list the folders you may read.")));
    }

    #[test]
    fn read_image_takes_one_required_path() {
        let image = spec_named(READ_IMAGE);
        let properties = image.parameters["properties"].as_object();
        assert_eq!(properties.map(serde_json::Map::len), Some(1));
        assert_eq!(
            image.parameters["properties"]["path"]["description"],
            "The full path of the image file."
        );
    }

    #[test]
    fn web_search_lists_every_source_id_in_its_schema() {
        let search = spec_named(WEB_SEARCH);
        let ids: Vec<&str> = search.parameters["properties"]["source"]["enum"]
            .as_array()
            .map(|values| values.iter().filter_map(serde_json::Value::as_str).collect())
            .unwrap_or_default();
        assert_eq!(
            ids,
            ["wikipedia", "hackernews", "stackoverflow", "npm", "crates"]
        );
        assert_eq!(search.parameters["properties"]["limit"]["maximum"], 10);
    }

    #[test]
    fn spec_serializes_with_camel_case_keys_and_lowercase_enums() {
        let json = serde_json::to_value(spec_named(LIST_DIRECTORY)).expect("serialize");
        assert_eq!(json["name"], LIST_DIRECTORY);
        assert_eq!(json["risk"], "read");
        assert_eq!(json["source"], "native");
        assert!(json.get("parameters").is_some());
        let fetch = serde_json::to_value(spec_named(WEB_FETCH)).expect("serialize");
        assert_eq!(fetch["risk"], "network");
    }
}
