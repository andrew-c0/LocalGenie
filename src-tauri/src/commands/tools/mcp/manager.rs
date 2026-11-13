//! The MCP servers that are running. Each server the app starts or tries to start has one entry:
//! its settings, its status and, while it runs, its session. Every status change is emitted as
//! `mcp-server-status`. The state lock is a std mutex that is never held across an await: a
//! connection is made outside it and its result is written back under it.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use rmcp::model::{CallToolRequestParams, CallToolResult, JsonObject};
use rmcp::service::{Peer, ServiceError};
use rmcp::RoleClient;
use tauri::{AppHandle, Emitter};
use tokio::time::timeout;

use super::config::{McpServerConfig, McpServerInfo, McpServerStatus};
use super::connect::{connect_session, list_tools, McpTool, Session};
use super::naming::NameAllocator;
use crate::commands::tools::limits::MCP_CALL_TIMEOUT_SECS;
use crate::commands::tools::TIMED_OUT;

/// The event that carries an `McpServerInfo` on every status change.
pub const STATUS_EVENT: &str = "mcp-server-status";

/// One tool of a running server, with the name the model sees.
#[derive(Clone)]
pub struct RunningTool {
    pub exposed_name: String,
    pub server_id: String,
    pub server_name: String,
    /// The name the server knows the tool by.
    pub tool_name: String,
    pub description: Option<String>,
    pub input_schema: JsonObject,
    pub peer: Peer<RoleClient>,
}

/// Receives every status change. The app sends it to the window; tests record it. Keeping the Tauri
/// handle out of the struct keeps the runtime out of the test binary.
type StatusNotifier = Box<dyn Fn(&McpServerInfo) + Send + Sync>;

/// Managed Tauri state: the running MCP servers.
#[derive(Default)]
pub struct McpManager {
    notify: Option<StatusNotifier>,
    state: Mutex<ManagerState>,
}

#[derive(Default)]
struct ManagerState {
    entries: HashMap<String, ServerEntry>,
    /// Counts up on every start and stop. A connection that ends with an older number is stale.
    next_generation: u64,
}

struct ServerEntry {
    config: McpServerConfig,
    generation: u64,
    status: McpServerStatus,
    error: Option<String>,
    session: Option<Session>,
}

impl ServerEntry {
    fn new(config: McpServerConfig) -> Self {
        Self {
            config,
            generation: 0,
            status: McpServerStatus::Stopped,
            error: None,
            session: None,
        }
    }
}

/// What a start has to do, decided under the lock.
enum StartStep {
    /// Nothing runs: connect, as the attempt with this generation.
    Connect(u64),
    /// A connection is already being made: report it.
    Busy(McpServerInfo),
    /// Running: list the tools again on this session.
    Refresh {
        generation: u64,
        peer: Peer<RoleClient>,
    },
}

impl McpManager {
    /// A manager that emits each status change to the window as `mcp-server-status`.
    pub fn new(app: AppHandle) -> Self {
        Self::with_notifier(move |info| {
            let _ = app.emit(STATUS_EVENT, info);
        })
    }

    /// A manager that passes each status change to `notify`.
    pub fn with_notifier(notify: impl Fn(&McpServerInfo) + Send + Sync + 'static) -> Self {
        Self {
            notify: Some(Box::new(notify)),
            state: Mutex::default(),
        }
    }

    /// The status of a server. A server the manager has never run is stopped.
    pub fn info(&self, config: &McpServerConfig) -> Result<McpServerInfo, String> {
        let state = self.lock()?;
        Ok(info_now(&state, config))
    }

    /// Whether a server is starting or running.
    pub fn is_active(&self, id: &str) -> Result<bool, String> {
        let state = self.lock()?;
        Ok(state.entries.get(id).is_some_and(|entry| {
            matches!(
                entry.status,
                McpServerStatus::Starting | McpServerStatus::Running
            )
        }))
    }

    /// Start a server. A server that is already running lists its tools again.
    pub async fn start(&self, config: McpServerConfig) -> Result<McpServerInfo, String> {
        match self.claim_start(&config)? {
            StartStep::Connect(generation) => self.connect(&config, generation).await,
            StartStep::Busy(info) => Ok(info),
            StartStep::Refresh { generation, peer } => {
                self.refresh(&config, generation, &peer).await
            }
        }
    }

    /// Stop a server and close its process. A connection still being made is discarded.
    pub async fn stop(&self, config: &McpServerConfig) -> Result<McpServerInfo, String> {
        let (info, session) = self.settle_stop(config)?;
        if let Some(session) = session {
            session.shutdown().await;
        }
        Ok(info)
    }

    /// Forget a server that was removed. Stop it first.
    pub fn forget(&self, id: &str) -> Result<(), String> {
        self.lock()?.entries.remove(id);
        Ok(())
    }

    /// The tools of the running servers, with the names the model sees. A server whose connection
    /// has closed is marked failed on the way.
    pub fn running_tools(&self) -> Result<Vec<RunningTool>, String> {
        let mut state = self.lock()?;
        let lost = mark_lost_connections(&mut state.entries);
        for info in &lost {
            self.publish(info);
        }
        Ok(collect_running_tools(&state.entries))
    }

    /// Call one running tool. A call that outlives its limit, or a connection that has closed, is
    /// an error with a readable text.
    pub async fn call_tool(
        &self,
        exposed_name: &str,
        arguments: Option<JsonObject>,
    ) -> Result<CallToolResult, String> {
        let tool = self
            .running_tools()?
            .into_iter()
            .find(|tool| tool.exposed_name == exposed_name)
            .ok_or_else(|| {
                format!("The tool '{exposed_name}' is not running: its MCP server is stopped or failed.")
            })?;
        let mut params = CallToolRequestParams::new(tool.tool_name.clone());
        params.arguments = arguments;
        let call = tool.peer.call_tool(params);
        match timeout(Duration::from_secs(MCP_CALL_TIMEOUT_SECS), call).await {
            Err(_elapsed) => Err(TIMED_OUT.to_string()),
            Ok(Ok(result)) => Ok(result),
            Ok(Err(error)) if is_lost_connection(&error) => {
                let message = lost_text(&tool.server_name);
                self.mark_failed(&tool.server_id, message.clone());
                Err(message)
            }
            Ok(Err(error)) => Err(format!("The tool failed: {error}")),
        }
    }

    /// Kill the process of every running server. Window-destroy handlers call this: it runs off
    /// the async runtime, so the sessions are left for the process to end.
    pub fn kill_all_sync(&self) {
        let Ok(state) = self.state.lock() else {
            return;
        };
        for entry in state.entries.values() {
            if let Some(session) = &entry.session {
                session.kill_sync();
            }
        }
    }

    async fn connect(
        &self,
        config: &McpServerConfig,
        generation: u64,
    ) -> Result<McpServerInfo, String> {
        let outcome = connect_session(config).await;
        let (info, stale) = self.settle_connect(config, generation, outcome)?;
        if let Some(session) = stale {
            session.shutdown().await;
        }
        Ok(info)
    }

    async fn refresh(
        &self,
        config: &McpServerConfig,
        generation: u64,
        peer: &Peer<RoleClient>,
    ) -> Result<McpServerInfo, String> {
        let listed = list_tools(peer).await;
        let (info, dead) = self.settle_refresh(config, generation, listed)?;
        if let Some(session) = dead {
            session.shutdown().await;
        }
        Ok(info)
    }

    /// Decide what a start does, and mark the server as starting when it connects.
    fn claim_start(&self, config: &McpServerConfig) -> Result<StartStep, String> {
        let mut guard = self.lock()?;
        let state = &mut *guard;
        let entry = state
            .entries
            .entry(config.id.clone())
            .or_insert_with(|| ServerEntry::new(config.clone()));
        entry.config = config.clone();
        match (entry.status, entry.session.as_ref()) {
            (McpServerStatus::Starting, _) => return Ok(StartStep::Busy(info_of(entry))),
            (McpServerStatus::Running, Some(session)) => {
                return Ok(StartStep::Refresh {
                    generation: entry.generation,
                    peer: session.peer(),
                })
            }
            _ => {}
        }
        state.next_generation += 1;
        entry.generation = state.next_generation;
        entry.status = McpServerStatus::Starting;
        entry.error = None;
        let info = info_of(entry);
        self.publish(&info);
        Ok(StartStep::Connect(entry.generation))
    }

    /// Record the outcome of a connection. Returns the info and, when the attempt was stale, the
    /// new session that must be shut down.
    fn settle_connect(
        &self,
        config: &McpServerConfig,
        generation: u64,
        outcome: Result<Session, String>,
    ) -> Result<(McpServerInfo, Option<Session>), String> {
        let mut guard = self.lock()?;
        let state = &mut *guard;
        let is_current = state
            .entries
            .get(&config.id)
            .is_some_and(|entry| entry.generation == generation);
        if !is_current {
            let info = info_now(state, config);
            return Ok((info, outcome.ok()));
        }
        let Some(entry) = state.entries.get_mut(&config.id) else {
            return Ok((McpServerInfo::stopped(config.clone()), outcome.ok()));
        };
        match outcome {
            Ok(session) => {
                entry.status = McpServerStatus::Running;
                entry.error = None;
                entry.session = Some(session);
            }
            Err(error) => {
                entry.status = McpServerStatus::Failed;
                entry.error = Some(error);
                entry.session = None;
            }
        }
        let info = info_of(entry);
        self.publish(&info);
        Ok((info, None))
    }

    /// Store a new tool list, or fail the server when the listing did not work.
    fn settle_refresh(
        &self,
        config: &McpServerConfig,
        generation: u64,
        listed: Result<Vec<McpTool>, String>,
    ) -> Result<(McpServerInfo, Option<Session>), String> {
        let mut guard = self.lock()?;
        let state = &mut *guard;
        let is_current = state.entries.get(&config.id).is_some_and(|entry| {
            entry.generation == generation && entry.status == McpServerStatus::Running
        });
        if !is_current {
            let info = info_now(state, config);
            return Ok((info, None));
        }
        let Some(entry) = state.entries.get_mut(&config.id) else {
            return Ok((McpServerInfo::stopped(config.clone()), None));
        };
        let dead = match listed {
            Ok(tools) => {
                if let Some(session) = entry.session.as_mut() {
                    session.set_tools(tools);
                }
                None
            }
            Err(error) => {
                entry.status = McpServerStatus::Failed;
                entry.error = Some(error);
                entry.session.take()
            }
        };
        let info = info_of(entry);
        self.publish(&info);
        Ok((info, dead))
    }

    /// Mark a stopped server and take its session, which the caller shuts down.
    fn settle_stop(
        &self,
        config: &McpServerConfig,
    ) -> Result<(McpServerInfo, Option<Session>), String> {
        let mut guard = self.lock()?;
        let state = &mut *guard;
        state.next_generation += 1;
        let generation = state.next_generation;
        let entry = state
            .entries
            .entry(config.id.clone())
            .or_insert_with(|| ServerEntry::new(config.clone()));
        entry.config = config.clone();
        entry.generation = generation;
        entry.status = McpServerStatus::Stopped;
        entry.error = None;
        let session = entry.session.take();
        let info = info_of(entry);
        self.publish(&info);
        Ok((info, session))
    }

    /// Mark a server failed after a call found its connection closed. The session is shut down in
    /// the background.
    fn mark_failed(&self, id: &str, message: String) {
        let Ok(mut guard) = self.state.lock() else {
            return;
        };
        let Some(entry) = guard.entries.get_mut(id) else {
            return;
        };
        entry.status = McpServerStatus::Failed;
        entry.error = Some(message);
        let session = entry.session.take();
        let info = info_of(entry);
        self.publish(&info);
        drop(guard);
        if let Some(session) = session {
            tauri::async_runtime::spawn(session.shutdown());
        }
    }

    fn publish(&self, info: &McpServerInfo) {
        if let Some(notify) = &self.notify {
            notify(info);
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, ManagerState>, String> {
        self.state
            .lock()
            .map_err(|_| "The MCP server list is unavailable. Restart the app.".to_string())
    }
}

fn info_of(entry: &ServerEntry) -> McpServerInfo {
    McpServerInfo {
        config: entry.config.clone(),
        status: entry.status,
        error: entry.error.clone(),
        tool_count: entry
            .session
            .as_ref()
            .map_or(0, |session| session.tools().len()),
    }
}

fn info_now(state: &ManagerState, config: &McpServerConfig) -> McpServerInfo {
    match state.entries.get(&config.id) {
        Some(entry) => info_of(entry),
        None => McpServerInfo::stopped(config.clone()),
    }
}

/// Fail every running server whose connection has closed, and drop its session.
fn mark_lost_connections(entries: &mut HashMap<String, ServerEntry>) -> Vec<McpServerInfo> {
    let mut infos = Vec::new();
    for entry in entries.values_mut() {
        let lost = entry.status == McpServerStatus::Running
            && entry.session.as_ref().is_some_and(Session::is_closed);
        if !lost {
            continue;
        }
        if let Some(session) = entry.session.take() {
            session.kill_sync();
        }
        entry.status = McpServerStatus::Failed;
        entry.error = Some(lost_text(&entry.config.name));
        infos.push(info_of(entry));
    }
    infos
}

/// The tools of the running servers. Servers are taken in name order, so the names do not move
/// between two calls while the set of running servers stays the same.
fn collect_running_tools(entries: &HashMap<String, ServerEntry>) -> Vec<RunningTool> {
    let mut running: Vec<(&ServerEntry, &Session)> = entries
        .values()
        .filter(|entry| entry.status == McpServerStatus::Running)
        .filter_map(|entry| entry.session.as_ref().map(|session| (entry, session)))
        .collect();
    running.sort_by(|(left, _), (right, _)| {
        left.config
            .name
            .cmp(&right.config.name)
            .then_with(|| left.config.id.cmp(&right.config.id))
    });

    let mut names = NameAllocator::default();
    let mut tools = Vec::new();
    for (entry, session) in running {
        let slug = names.server_slug(&entry.config.name);
        for tool in session.tools() {
            tools.push(RunningTool {
                exposed_name: names.tool_name(&slug, &tool.name),
                server_id: entry.config.id.clone(),
                server_name: entry.config.name.clone(),
                tool_name: tool.name.clone(),
                description: tool.description.clone(),
                input_schema: tool.input_schema.clone(),
                peer: session.peer(),
            });
        }
    }
    tools
}

fn is_lost_connection(error: &ServiceError) -> bool {
    matches!(
        error,
        ServiceError::TransportClosed | ServiceError::TransportSend(_)
    )
}

fn lost_text(server_name: &str) -> String {
    format!("The MCP server '{server_name}' stopped answering. Start it again in Settings > Tools.")
}

#[cfg(test)]
mod tests {
    use super::super::config::{McpServerConfig, McpTransport};
    use super::*;
    use std::collections::BTreeMap;
    use std::sync::Arc;

    fn config(id: &str) -> McpServerConfig {
        McpServerConfig {
            id: id.into(),
            name: "Docs".into(),
            transport: McpTransport::Stdio,
            command: Some("npx".into()),
            args: Vec::new(),
            env: BTreeMap::new(),
            url: None,
            headers: BTreeMap::new(),
            enabled: false,
        }
    }

    #[test]
    fn a_server_the_manager_never_ran_is_stopped() {
        let manager = McpManager::default();
        let info = manager.info(&config("a")).expect("info");
        assert_eq!(info.status, McpServerStatus::Stopped);
        assert_eq!(info.tool_count, 0);
        assert!(info.error.is_none());
        assert!(!manager.is_active("a").expect("active"));
    }

    #[test]
    fn nothing_is_running_in_a_new_manager() {
        let manager = McpManager::default();
        assert!(manager.running_tools().expect("tools").is_empty());
    }

    #[tokio::test]
    async fn stopping_a_server_that_never_ran_reports_it_stopped() {
        let manager = McpManager::default();
        let info = manager.stop(&config("a")).await.expect("stop");
        assert_eq!(info.status, McpServerStatus::Stopped);
    }

    #[tokio::test]
    async fn a_call_to_a_tool_that_is_not_running_says_so() {
        let manager = McpManager::default();
        let error = manager
            .call_tool("mcp__docs__search", None)
            .await
            .expect_err("not running");
        assert_eq!(
            error,
            "The tool 'mcp__docs__search' is not running: its MCP server is stopped or failed."
        );
    }

    #[test]
    fn a_failed_start_keeps_the_error_and_no_tools() {
        let manager = McpManager::default();
        let cfg = config("a");
        let StartStep::Connect(generation) = manager.claim_start(&cfg).expect("claim") else {
            panic!("expected a connect step");
        };
        let (info, stale) = manager
            .settle_connect(&cfg, generation, Err("The server did not start.".into()))
            .expect("settle");
        assert!(stale.is_none());
        assert_eq!(info.status, McpServerStatus::Failed);
        assert_eq!(info.error.as_deref(), Some("The server did not start."));
        assert_eq!(info.tool_count, 0);
    }

    #[test]
    fn a_second_start_while_connecting_reports_busy() {
        let manager = McpManager::default();
        let cfg = config("a");
        assert!(matches!(
            manager.claim_start(&cfg).expect("first"),
            StartStep::Connect(_)
        ));
        let second = manager.claim_start(&cfg).expect("second");
        let StartStep::Busy(info) = second else {
            panic!("expected busy");
        };
        assert_eq!(info.status, McpServerStatus::Starting);
    }

    #[test]
    fn a_stop_during_a_connect_makes_that_connect_stale() {
        let manager = McpManager::default();
        let cfg = config("a");
        let StartStep::Connect(generation) = manager.claim_start(&cfg).expect("claim") else {
            panic!("expected a connect step");
        };
        manager.settle_stop(&cfg).expect("stop");
        let (info, _) = manager
            .settle_connect(&cfg, generation, Err("late".into()))
            .expect("settle");
        assert_eq!(info.status, McpServerStatus::Stopped);
        assert!(info.error.is_none());
    }

    #[test]
    fn every_status_change_is_passed_to_the_notifier() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&seen);
        let manager = McpManager::with_notifier(move |info| {
            if let Ok(mut statuses) = sink.lock() {
                statuses.push(info.status);
            }
        });
        let cfg = config("a");
        let StartStep::Connect(generation) = manager.claim_start(&cfg).expect("claim") else {
            panic!("expected a connect step");
        };
        manager
            .settle_connect(&cfg, generation, Err("nope".into()))
            .expect("settle");
        manager.settle_stop(&cfg).expect("stop");
        let statuses = seen.lock().expect("lock").clone();
        assert_eq!(
            statuses,
            [
                McpServerStatus::Starting,
                McpServerStatus::Failed,
                McpServerStatus::Stopped
            ]
        );
    }

    #[test]
    fn the_lost_connection_text_names_the_server_and_the_fix() {
        assert_eq!(
            lost_text("Docs"),
            "The MCP server 'Docs' stopped answering. Start it again in Settings > Tools."
        );
    }

    #[test]
    fn only_closed_transports_count_as_a_lost_connection() {
        assert!(is_lost_connection(&ServiceError::TransportClosed));
        assert!(!is_lost_connection(&ServiceError::UnexpectedResponse));
    }
}
