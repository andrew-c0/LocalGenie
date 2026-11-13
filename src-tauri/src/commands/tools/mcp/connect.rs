//! Starts one MCP server and lists its tools. A stdio server is a child process the app owns, run in
//! the server's working folder with its stderr read into a tail; an HTTP server is a streamable HTTP
//! session with the configured headers. The whole start, with the tool listing, is bounded by
//! `CONNECT_TIMEOUT_SECS`. Every failure comes back as the readable text the UI shows, with the
//! server's own output appended when it wrote any.

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
use super::stderr::StderrTail;
use crate::commands::server;

/// Longest time a server may take to start and list its tools.
pub const CONNECT_TIMEOUT_SECS: u64 = 30;
/// Longest time a session may take to close before its process is killed.
const SHUTDOWN_TIMEOUT_SECS: u64 = 5;
/// Longest time a failure waits for a dead server's stderr to end, so its last words are shown.
const OUTPUT_SETTLE_SECS: u64 = 1;

/// A tool a server listed, as the manager keeps it.
#[derive(Debug, Clone)]
pub struct McpTool {
    /// The name the server knows the tool by.
    pub name: String,
    pub description: Option<String>,
    pub input_schema: rmcp::model::JsonObject,
}

/// One live connection to a server. A stdio session also keeps the process id, for the kill, and
/// the tail of the server's stderr.
pub struct Session {
    client: RunningService<RoleClient, ()>,
    pid: Option<u32>,
    tools: Vec<McpTool>,
    stderr: StderrTail,
}

impl Session {
    fn new(client: RunningService<RoleClient, ()>, pid: Option<u32>, stderr: StderrTail) -> Self {
        Self {
            client,
            pid,
            tools: Vec::new(),
            stderr,
        }
    }

    pub fn tools(&self) -> &[McpTool] {
        &self.tools
    }

    pub fn set_tools(&mut self, tools: Vec<McpTool>) {
        self.tools = tools;
    }

    /// The server's stderr tail, for the text of a failure.
    pub fn stderr(&self) -> &StderrTail {
        &self.stderr
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

/// Start a server and list its tools. The session is returned open; the caller shuts it down.
pub async fn connect_session(config: &McpServerConfig) -> Result<Session, String> {
    let stderr = StderrTail::new(secret_values(config));
    match timeout(
        Duration::from_secs(CONNECT_TIMEOUT_SECS),
        start_and_list(config, &stderr),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Err(stderr.with_output(&format!(
            "The server did not answer within {CONNECT_TIMEOUT_SECS} seconds."
        ))),
    }
}

/// Start the server, then list its tools. A session whose listing fails is shut down first, so
/// its output has ended when the error is written.
async fn start_and_list(config: &McpServerConfig, stderr: &StderrTail) -> Result<Session, String> {
    let mut session = start(config, stderr).await?;
    match list_tools(&session.peer()).await {
        Ok(tools) => {
            session.set_tools(tools);
            Ok(session)
        }
        Err(error) => {
            session.shutdown().await;
            stderr
                .wait_ended(Duration::from_secs(OUTPUT_SETTLE_SECS))
                .await;
            Err(stderr.with_output(&error))
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

async fn start(config: &McpServerConfig, stderr: &StderrTail) -> Result<Session, String> {
    match config.transport {
        McpTransport::Stdio => start_stdio(config, stderr).await,
        McpTransport::Http => {
            let url = config
                .url
                .as_deref()
                .ok_or("Enter a web address that starts with http:// or https://.")?;
            start_http(url, &config.headers, stderr).await
        }
    }
}

async fn start_stdio(config: &McpServerConfig, stderr: &StderrTail) -> Result<Session, String> {
    let command = config
        .command
        .as_deref()
        .ok_or("Enter the command that starts the server.")?;
    let program = program::resolve_program(command)?;
    let folder = program::working_folder(config.cwd.as_deref())?;
    let mut process_command = program::command(&program);
    process_command.args(&config.args).envs(&config.env);
    if let Some(folder) = folder {
        process_command.current_dir(folder);
    }
    let (process, output) = TokioChildProcess::builder(process_command)
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start '{command}': {error}"))?;
    if let Some(output) = output {
        stderr.read_from(output);
    }
    let pid = process.id();
    match ().serve(process).await {
        Ok(client) => Ok(Session::new(client, pid, stderr.clone())),
        Err(error) => {
            stderr
                .wait_ended(Duration::from_secs(OUTPUT_SETTLE_SECS))
                .await;
            Err(stderr.with_output(&format!("The server did not start: {error}")))
        }
    }
}

async fn start_http(
    url: &str,
    headers: &BTreeMap<String, String>,
    stderr: &StderrTail,
) -> Result<Session, String> {
    let header_map: HashMap<_, _> = config::parse_headers(headers)?.into_iter().collect();
    let transport_config =
        StreamableHttpClientTransportConfig::with_uri(url).custom_headers(header_map);
    let transport = StreamableHttpClientTransport::from_config(transport_config);
    let client = ()
        .serve(transport)
        .await
        .map_err(|error| stderr.with_output(&http_start_error(url, &error)))?;
    Ok(Session::new(client, None, stderr.clone()))
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

/// The environment and header values of a server. They are blanked out of any text shown.
fn secret_values(config: &McpServerConfig) -> Vec<String> {
    config
        .env
        .values()
        .chain(config.headers.values())
        .cloned()
        .collect()
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
