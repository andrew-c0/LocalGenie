//! Tests a server with its unsaved settings: it connects, lists the tools and closes again. Nothing is
//! saved and the running servers and the tool list are not touched. A server that cannot be reached
//! or listed is a failed result, not an error.

use serde::Serialize;

use super::config::{normalize, McpServerConfig};
use super::connect::{connect_session, McpTool};

/// The outcome of a test. `error` is set when the server could not be started or listed.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTestResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub tools: Vec<McpToolSummary>,
}

/// A tool a test server listed, under the name the server gives it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolSummary {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Connect with `config`, list its tools and close the server. The config is checked and used as it
/// is given; nothing is saved.
pub async fn test_server(config: McpServerConfig) -> McpTestResult {
    result_of(list_once(config).await)
}

/// The tools a server lists when started with `config`. The session is closed before this returns.
async fn list_once(config: McpServerConfig) -> Result<Vec<McpTool>, String> {
    let config = normalize(config)?;
    let session = connect_session(&config).await?;
    let tools = session.tools().to_vec();
    session.shutdown().await;
    Ok(tools)
}

/// The test result for a listing: `ok` with the tools, or not `ok` with the error.
fn result_of(listing: Result<Vec<McpTool>, String>) -> McpTestResult {
    match listing {
        Ok(tools) => McpTestResult {
            ok: true,
            error: None,
            tools: tools.iter().map(summary_of).collect(),
        },
        Err(error) => McpTestResult {
            ok: false,
            error: Some(error),
            tools: Vec::new(),
        },
    }
}

fn summary_of(tool: &McpTool) -> McpToolSummary {
    McpToolSummary {
        name: tool.name.clone(),
        description: tool.description.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::super::config::McpTransport;
    use super::*;
    use std::collections::BTreeMap;

    fn tool(name: &str, description: Option<&str>) -> McpTool {
        McpTool {
            name: name.into(),
            description: description.map(str::to_string),
            input_schema: rmcp::model::JsonObject::new(),
        }
    }

    #[test]
    fn a_listing_becomes_an_ok_result_with_the_tools_as_the_server_named_them() {
        let result = result_of(Ok(vec![
            tool("read.file", Some("Reads a file")),
            tool("ping", None),
        ]));
        assert!(result.ok);
        assert_eq!(result.error, None);
        assert_eq!(
            result.tools,
            [
                McpToolSummary {
                    name: "read.file".into(),
                    description: Some("Reads a file".into()),
                },
                McpToolSummary {
                    name: "ping".into(),
                    description: None,
                },
            ]
        );
    }

    #[test]
    fn a_failed_listing_becomes_a_result_with_the_error_and_no_tools() {
        let result = result_of(Err("The server did not start.".into()));
        assert_eq!(
            result,
            McpTestResult {
                ok: false,
                error: Some("The server did not start.".into()),
                tools: Vec::new(),
            }
        );
    }

    #[test]
    fn the_result_serialises_in_camel_case_and_leaves_out_empty_fields() {
        let ok = serde_json::to_value(result_of(Ok(vec![tool("ping", None)]))).expect("json");
        assert_eq!(ok["ok"], true);
        assert!(ok.get("error").is_none());
        assert_eq!(ok["tools"][0]["name"], "ping");
        assert!(ok["tools"][0].get("description").is_none());

        let failed = serde_json::to_value(result_of(Err("no".into()))).expect("json");
        assert_eq!(failed["ok"], false);
        assert_eq!(failed["error"], "no");
        assert_eq!(failed["tools"], serde_json::json!([]));
    }

    #[tokio::test]
    async fn a_config_that_is_not_valid_is_a_failed_result_not_an_error() {
        let config = McpServerConfig {
            id: String::new(),
            name: "   ".into(),
            transport: McpTransport::Stdio,
            command: Some("npx".into()),
            args: Vec::new(),
            env: BTreeMap::new(),
            cwd: None,
            url: None,
            headers: BTreeMap::new(),
            enabled: false,
            slug: String::new(),
        };
        let result = test_server(config).await;
        assert!(!result.ok);
        assert_eq!(result.error.as_deref(), Some("Give the server a name."));
        assert!(result.tools.is_empty());
    }
}
