//! MCP client (Settings > Tools). The servers the user adds run here; their tools join the native
//! tools in `tool_list` and run through `tool_execute`. `store` keeps the settings in the database,
//! `manager` runs the servers, `naming` gives the tool names the model sees, `program` and `connect`
//! start a server, `result` turns a result into text, `stderr` keeps a server's last output,
//! `probe` tests a server before it is saved, and `commands` is the IPC surface.

pub mod commands;
mod config;
mod connect;
mod manager;
mod naming;
mod probe;
mod program;
mod result;
mod stderr;
mod store;

use super::spec::ToolSpec;
use super::{parse_arguments, ToolOutput};
pub use manager::McpManager;
pub use naming::{backfill_slugs, is_mcp_name};

/// The specs of the tools of the running servers, in the order the manager gives them.
pub(super) fn tool_specs(manager: &McpManager) -> Result<Vec<ToolSpec>, String> {
    Ok(manager
        .running_tools()?
        .into_iter()
        .map(|tool| {
            ToolSpec::mcp(
                &tool.exposed_name,
                tool.description.as_deref().unwrap_or_default(),
                serde_json::Value::Object(tool.input_schema),
                &tool.server_id,
                &tool.server_name,
            )
        })
        .collect())
}

/// Run one call to an MCP tool. The model's arguments must be a JSON object, or empty.
pub(super) async fn call_tool_output(
    manager: &McpManager,
    name: &str,
    arguments: &str,
) -> Result<ToolOutput, String> {
    let arguments = match parse_arguments(arguments)? {
        serde_json::Value::Object(map) => Some(map),
        _ => return Err("The arguments must be a JSON object.".into()),
    };
    let result = manager.call_tool(name, arguments).await?;
    result::outcome_of(&result)
}
