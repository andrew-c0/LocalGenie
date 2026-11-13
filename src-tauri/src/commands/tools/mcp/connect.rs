//! Starts one MCP server and lists its tools. A stdio server is a child process the app owns; an
//! HTTP server is a streamable HTTP session with the configured headers. The whole start, with the
//! tool listing, is bounded by `CONNECT_TIMEOUT_SECS`.

use std::collections::{BTreeMap, HashMap};
use std::error::Error;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use rmcp::model::Tool;
use rmcp::service::{ClientInitializeError, Peer, RunningService};
use rmcp::transport::streamable_http_client::{
    AuthRequiredError, HttpStatusError, StreamableHttpClientTransport,
    StreamableHttpClientTransportConfig,
};
use rmcp::transport::TokioChildProcess;
use rmcp::{RoleClient, ServiceExt};
use tokio::time::timeout;

use super::config::{self, McpServerConfig, McpTransport};
use super::program;
use crate::commands::server;

/// Longest time a server may take to start and list its tools.
pub const CONNECT_TIMEOUT_SECS: u64 = 30;
/// Longest time a session may take to close before its process is killed.
const SHUTDOWN_TIMEOUT_SECS: u64 = 5;

/// A tool a server listed, as the manager keeps it.
#[derive(Debug, Clone)]
pub struct McpTool {
    /// The name the server knows the tool by.
    pub name: String,
    pub description: Option<String>,
    pub input_schema: rmcp::model::JsonObject,
}

/// One live connection to a server. A stdio session also keeps the process id, for the kill.
pub struct Session {
    client: RunningService<RoleClient, ()>,
    pid: Option<u32>,
    tools: Vec<McpTool>,
}

impl Session {
    fn new(client: RunningService<RoleClient, ()>, pid: Option<u32>) -> Self {
        Self {
            client,
            pid,
            tools: Vec::new(),
        }
    }

    pub fn tools(&self) -> &[McpTool] {
        &self.tools
    }

    pub fn set_tools(&mut self, tools: Vec<McpTool>) {
        self.tools = tools;
    }

    /// A handle for calls on this session. It stays usable only while the session is open.
    pub fn peer(&self) -> Peer<RoleClient> {
        self.client.peer().clone()
    }

    /// Whether the connection has closed, for example because the process exited.
    pub fn is_closed(&self) -> bool {
        self.client.is_closed()
    }

    /// Kill the process tree of a stdio server without waiting. For window-destroy handlers.
    pub fn kill_sync(&self) {
        if let Some(pid) = self.pid {
            server::kill_process_sync(pid);
        }
    }

    /// Close the session, give the server a few seconds to exit, then kill its process tree.
    pub async fn shutdown(self) {
        let Session { client, pid, .. } = self;
        let _ = timeout(Duration::from_secs(SHUTDOWN_TIMEOUT_SECS), client.cancel()).await;
        if let Some(pid) = pid {
            server::kill_process(pid).await;
        }
    }
}

/// Start a server and list its tools. Every failure comes back as the readable text the UI shows.
pub async fn connect_session(config: &McpServerConfig) -> Result<Session, String> {
    timeout(
        Duration::from_secs(CONNECT_TIMEOUT_SECS),
        start_and_list(config),
    )
    .await
    .map_err(|_| format!("The server did not answer within {CONNECT_TIMEOUT_SECS} seconds."))?
}

/// Start the server, then list its tools. A session whose listing fails is shut down.
async fn start_and_list(config: &McpServerConfig) -> Result<Session, String> {
    let mut session = start(config).await?;
    match list_tools(&session.peer()).await {
        Ok(tools) => {
            session.set_tools(tools);
            Ok(session)
        }
        Err(error) => {
            session.shutdown().await;
            Err(error)
        }
    }
}

/// The tools a server lists now, read in full (all pages), within the connect time limit.
pub async fn list_tools(peer: &Peer<RoleClient>) -> Result<Vec<McpTool>, String> {
    let listing = timeout(
        Duration::from_secs(CONNECT_TIMEOUT_SECS),
        peer.list_all_tools(),
    )
    .await
    .map_err(|_| "The server did not list its tools in time.".to_string())?;
    let tools = listing.map_err(|error| format!("The server could not list its tools: {error}"))?;
    Ok(tools.into_iter().map(McpTool::from).collect())
}

async fn start(config: &McpServerConfig) -> Result<Session, String> {
    match config.transport {
        McpTransport::Stdio => {
            let command = config
                .command
                .as_deref()
                .ok_or("Enter the command that starts the server.")?;
            start_stdio(command, &config.args, &config.env).await
        }
        McpTransport::Http => {
            let url = config
                .url
                .as_deref()
                .ok_or("Enter a web address that starts with http:// or https://.")?;
            start_http(url, &config.headers).await
        }
    }
}

async fn start_stdio(
    command: &str,
    args: &[String],
    env: &BTreeMap<String, String>,
) -> Result<Session, String> {
    let program = program::resolve_program(command)?;
    let mut process_command = program::command(&program);
    process_command.args(args).envs(env);
    let (process, _no_stderr) = TokioChildProcess::builder(process_command)
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start '{command}': {error}"))?;
    let pid = process.id();
    let client = ()
        .serve(process)
        .await
        .map_err(|error| format!("The server did not start: {error}"))?;
    Ok(Session::new(client, pid))
}

async fn start_http(url: &str, headers: &BTreeMap<String, String>) -> Result<Session, String> {
    let header_map: HashMap<_, _> = config::parse_headers(headers)?.into_iter().collect();
    let transport_config =
        StreamableHttpClientTransportConfig::with_uri(url).custom_headers(header_map);
    let transport = StreamableHttpClientTransport::from_config(transport_config);
    let client = ().serve(transport).await.map_err(|error| http_start_error(url, &error))?;
    Ok(Session::new(client, None))
}

/// The readable reason an HTTP server did not start. A server that answered with an error is not
/// reported as unreachable, so the UI does not show it as offline.
fn http_start_error(url: &str, error: &ClientInitializeError) -> String {
    let answered = match error {
        ClientInitializeError::TransportError { error, .. } => chain_answered(error),
        _ => true,
    };
    if answered {
        format!("The MCP server at {url} did not start: {error}")
    } else {
        format!("Failed to reach the MCP server at {url}: {error}")
    }
}

/// Whether an error chain holds an HTTP status or an authorisation challenge from the server.
fn chain_answered(error: &(dyn Error + 'static)) -> bool {
    let mut current = Some(error);
    while let Some(link) = current {
        if link.is::<HttpStatusError>() || link.is::<AuthRequiredError>() {
            return true;
        }
        current = link.source();
    }
    false
}

impl From<Tool> for McpTool {
    fn from(tool: Tool) -> Self {
        Self {
            name: tool.name.into_owned(),
            description: tool.description.map(|text| text.into_owned()),
            input_schema: Arc::unwrap_or_clone(tool.input_schema),
        }
    }
}
