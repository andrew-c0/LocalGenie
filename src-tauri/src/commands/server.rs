use super::constants::{DEFAULT_PORT, SERVER_STATUS_TIMEOUT_SECS};
use super::AppState;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::sync::MutexGuard;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::process::Command;

/// Status of one GenieX serve process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub models: Vec<String>,
}

/// Payload of the `server-stopped` event: the port whose server exited without a stop request.
#[derive(Debug, Clone, Serialize)]
pub struct ServerStoppedEvent {
    pub port: u16,
}

/// Force-kill a process tree by PID (Windows: `taskkill /T`, else `kill -9`).
/// Sync variant used from window-destroy handlers where async is unavailable.
pub fn kill_process_sync(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F", "/T"])
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .output();
    }
}

/// Async variant for command handlers.
pub async fn kill_process(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F", "/T"])
            .output()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .output()
            .await;
    }
}

/// Fetch the ids (`org/repo:precision`) of the models loaded on the server, from `GET /status`.
/// `/v1/models` is not used: it lists every cached model, loaded or not. An empty list means
/// nothing is loaded; an error means the server does not answer.
pub(crate) async fn fetch_loaded_models(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<Vec<String>, String> {
    let resp = client
        .get(format!("{base_url}/status"))
        .timeout(std::time::Duration::from_secs(
            super::constants::HTTP_TIMEOUT_SECS,
        ))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Server returned {} for /status", resp.status()));
    }
    let body: serde_json::Value = resp.json().await.unwrap_or_default();
    Ok(loaded_ids(&body))
}

/// Ids from the `models` array of a `/status` body. A missing or empty array means nothing is loaded.
fn loaded_ids(body: &serde_json::Value) -> Vec<String> {
    body["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn local_base_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

/// Optional configuration for `geniex serve`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStartOptions {
    pub port: Option<u16>,
    pub compute: Option<String>,
    pub nctx: Option<i32>,
    pub ngl: Option<i32>,
    pub origins: Option<String>,
    pub keepalive: Option<i32>,
}

/// Arguments for `geniex serve` on `serve_port`. An option the app did not set is left out,
/// so the CLI uses its own default for it.
fn serve_args(serve_port: u16, opts: &ServerStartOptions) -> Vec<String> {
    let mut args = vec![
        "serve".to_string(),
        "--host".to_string(),
        format!("127.0.0.1:{serve_port}"),
    ];
    if let Some(compute) = &opts.compute {
        args.extend(["--compute".to_string(), compute.clone()]);
    }
    if let Some(nctx) = opts.nctx {
        args.extend(["--nctx".to_string(), nctx.to_string()]);
    }
    if let Some(ngl) = opts.ngl {
        args.extend(["--ngl".to_string(), ngl.to_string()]);
    }
    if let Some(origins) = &opts.origins {
        args.extend(["--origins".to_string(), origins.clone()]);
    }
    if let Some(keepalive) = opts.keepalive {
        args.extend(["--keepalive".to_string(), keepalive.to_string()]);
    }
    args
}

/// Start a `geniex serve` process on the port in `options` (default port when unset).
/// A server already answering there, or a tracked process for that port, is reused.
#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Option<ServerStartOptions>,
) -> Result<ServerStatus, String> {
    let opts = options.unwrap_or_default();
    let serve_port = opts.port.unwrap_or(DEFAULT_PORT);

    // A server already answering on the port (ours or external) is reused.
    if fetch_loaded_models(&state.http_client, &local_base_url(serve_port))
        .await
        .is_ok()
    {
        return Ok(probe_status(&state.http_client, serve_port).await);
    }

    // Our tracked process is cleared by its exit watcher, so a tracked PID means it is alive.
    if tracked_pid(&state, serve_port)?.is_some() {
        return Ok(probe_status(&state.http_client, serve_port).await);
    }

    let mut child = Command::new(super::cli::resolve_geniex_executable())
        .args(serve_args(serve_port, &opts))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "GenieX CLI not found. Ensure `geniex` is installed and in your PATH.".to_string()
            } else {
                format!("Failed to start `geniex serve`: {e}")
            }
        })?;

    let pid = child.id().unwrap_or(0);
    match track_spawned(&state, serve_port, pid) {
        Ok(true) => {}
        // Another start won the race for this port, or the state is unavailable. This child is
        // not tracked, so stop it rather than leave it running.
        Ok(false) => {
            kill_process(pid).await;
            return Ok(probe_status(&state.http_client, serve_port).await);
        }
        Err(e) => {
            kill_process(pid).await;
            return Err(e);
        }
    }

    if let Some(stdout) = child.stdout.take() {
        forward_lines(app.clone(), stdout, "stdout");
    }
    if let Some(stderr) = child.stderr.take() {
        forward_lines(app.clone(), stderr, "stderr");
    }

    // When the process exits, forget its entry so the next start actually spawns.
    tokio::spawn(async move {
        let _ = child.wait().await;
        // A stop request removes the entry before it kills the process, so only an exit we did not
        // ask for still finds it here and is reported.
        let unexpected = app
            .state::<AppState>()
            .server_processes
            .lock()
            .map(|mut servers| untrack_server(&mut servers, serve_port, pid))
            .unwrap_or(false);
        if unexpected {
            let _ = app.emit("server-stopped", ServerStoppedEvent { port: serve_port });
        }
    });

    // Poll for readiness instead of a fixed sleep.
    for _ in 0..super::constants::SERVER_STARTUP_PROBES {
        tokio::time::sleep(Duration::from_millis(
            super::constants::SERVER_STARTUP_PROBE_DELAY_MS,
        ))
        .await;
        if fetch_loaded_models(&state.http_client, &local_base_url(serve_port))
            .await
            .is_ok()
        {
            break;
        }
    }

    // Report the current status even if the server is still starting.
    Ok(probe_status(&state.http_client, serve_port).await)
}

/// Stream a child's output lines to the frontend as `server-log` events.
fn forward_lines<R>(app: AppHandle, reader: R, stream: &'static str)
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            super::logs::record(&app, stream, line);
        }
    });
}

/// Lock the map of tracked servers. The guard must not be held across an `.await`.
fn lock_servers(state: &AppState) -> Result<MutexGuard<'_, HashMap<u16, u32>>, String> {
    state
        .server_processes
        .lock()
        .map_err(|_| "server state is unavailable".to_string())
}

/// The pid of the server the app started on `port`, if it is still tracked.
pub(crate) fn tracked_pid(state: &AppState, port: u16) -> Result<Option<u32>, String> {
    Ok(lock_servers(state)?.get(&port).copied())
}

/// Record a freshly spawned server. Returns false when the port already has a tracked server.
fn track_spawned(state: &AppState, port: u16, pid: u32) -> Result<bool, String> {
    let mut servers = lock_servers(state)?;
    Ok(track_server(&mut servers, port, pid))
}

/// Records `pid` as the server on `port`. Returns false, and keeps the existing entry, when the
/// port already has one.
fn track_server(servers: &mut HashMap<u16, u32>, port: u16, pid: u32) -> bool {
    match servers.entry(port) {
        Entry::Occupied(_) => false,
        Entry::Vacant(slot) => {
            slot.insert(pid);
            true
        }
    }
}

/// Forgets the server on `port`, but only while it is still `pid`. A late exit watcher then cannot
/// remove a newer server on the same port. Returns true when an entry was removed.
fn untrack_server(servers: &mut HashMap<u16, u32>, port: u16, pid: u32) -> bool {
    if servers.get(&port) == Some(&pid) {
        servers.remove(&port);
        true
    } else {
        false
    }
}

/// Empties the map and returns its servers as `(port, pid)`, ordered by port.
fn take_all_servers(servers: &mut HashMap<u16, u32>) -> Vec<(u16, u32)> {
    let mut all: Vec<(u16, u32)> = servers.drain().collect();
    all.sort_unstable();
    all
}

/// Ports that have a tracked server, ordered.
fn tracked_ports(servers: &HashMap<u16, u32>) -> Vec<u16> {
    let mut ports: Vec<u16> = servers.keys().copied().collect();
    ports.sort_unstable();
    ports
}

/// Asks the OS for a free localhost port: binds port 0, reads the port, then releases the listener.
/// Another program can take the port before a server uses it, so callers should use it promptly.
fn reserve_free_port() -> std::io::Result<u16> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

/// A free localhost port, for a server that has no port set.
#[tauri::command]
pub fn free_port() -> Result<u16, String> {
    reserve_free_port().map_err(|e| format!("No free port is available: {e}"))
}

/// Stop the server on `port` (default port when unset). Other servers are left running.
#[tauri::command]
pub async fn stop_server(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<ServerStatus, String> {
    let serve_port = port.unwrap_or(DEFAULT_PORT);
    let pid = lock_servers(&state)?.remove(&serve_port);
    if let Some(pid) = pid {
        kill_process(pid).await;
    }
    Ok(stopped_status(serve_port))
}

/// Stop every server the app started. Used when the app shuts down, so none is left orphaned.
#[tauri::command]
pub async fn stop_all_servers(state: State<'_, AppState>) -> Result<(), String> {
    let servers = {
        let mut map = lock_servers(&state)?;
        take_all_servers(&mut map)
    };
    for (_, pid) in servers {
        kill_process(pid).await;
    }
    Ok(())
}

/// Kill every tracked server from a sync context (the window-destroy handler, which cannot await).
/// Same drain as `stop_all_servers`. A poisoned lock is still read, so no server is left running.
pub fn kill_all_servers_sync(state: &AppState) {
    let servers = match state.server_processes.lock() {
        Ok(mut servers) => take_all_servers(&mut servers),
        Err(poisoned) => take_all_servers(&mut poisoned.into_inner()),
    };
    for (_, pid) in servers {
        kill_process_sync(pid);
    }
}

/// Report whether a server answers on the port and which models it has loaded.
/// Works regardless of whether we spawned the server or it's running externally.
#[tauri::command]
pub async fn get_server_status(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<ServerStatus, String> {
    Ok(probe_status(&state.http_client, port.unwrap_or(DEFAULT_PORT)).await)
}

/// Status of every port the app is tracking, ordered by port. A tracked port that does not answer
/// in time is listed as not running.
#[tauri::command]
pub async fn list_servers(state: State<'_, AppState>) -> Result<Vec<ServerStatus>, String> {
    let ports = {
        let servers = lock_servers(&state)?;
        tracked_ports(&servers)
    };
    let client = &state.http_client;
    let probes = ports.into_iter().map(|port| probe_listed(client, port));
    Ok(futures_util::future::join_all(probes).await)
}

/// One `list_servers` entry: the status probe, bounded so one hung server cannot stall the list.
async fn probe_listed(client: &reqwest::Client, port: u16) -> ServerStatus {
    let limit = Duration::from_secs(SERVER_STATUS_TIMEOUT_SECS);
    tokio::time::timeout(limit, probe_status(client, port))
        .await
        .unwrap_or_else(|_| stopped_status(port))
}

/// Status of the server on `port`: running with its loaded models when it answers `/status`,
/// otherwise not running.
async fn probe_status(client: &reqwest::Client, port: u16) -> ServerStatus {
    match fetch_loaded_models(client, &local_base_url(port)).await {
        Ok(models) => ServerStatus {
            running: true,
            port,
            models,
        },
        Err(_) => stopped_status(port),
    }
}

fn stopped_status(port: u16) -> ServerStatus {
    ServerStatus {
        running: false,
        port,
        models: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::{
        loaded_ids, reserve_free_port, serve_args, take_all_servers, track_server, tracked_ports,
        untrack_server, ServerStartOptions,
    };
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn reads_loaded_ids_from_status_models() {
        let body = json!({
            "alive": true,
            "models": [
                {"id": "unsloth/gemma-4-E4B-it-GGUF:Q4_K_M", "state": "idle"},
                {"id": "qualcomm/Qwen3-4B:W4A16", "state": "busy"}
            ]
        });
        assert_eq!(
            loaded_ids(&body),
            vec![
                "unsloth/gemma-4-E4B-it-GGUF:Q4_K_M",
                "qualcomm/Qwen3-4B:W4A16"
            ]
        );
    }

    #[test]
    fn empty_models_means_nothing_loaded() {
        assert!(loaded_ids(&json!({"alive": true, "models": []})).is_empty());
    }

    #[test]
    fn missing_models_key_means_nothing_loaded() {
        assert!(loaded_ids(&json!({"alive": true})).is_empty());
        assert!(loaded_ids(&json!(null)).is_empty());
    }

    #[test]
    fn skips_entries_without_a_string_id() {
        let body = json!({"models": [{"state": "idle"}, {"id": 7}, {"id": "org/repo:Q4"}]});
        assert_eq!(loaded_ids(&body), vec!["org/repo:Q4"]);
    }

    #[test]
    fn serve_args_with_no_options_use_only_the_port() {
        let args = serve_args(18181, &ServerStartOptions::default());
        assert_eq!(args, vec!["serve", "--host", "127.0.0.1:18181"]);
    }

    #[test]
    fn serve_args_pass_each_option_that_is_set() {
        let opts = ServerStartOptions {
            port: Some(18190),
            compute: Some("npu".into()),
            nctx: Some(4096),
            ngl: Some(99),
            origins: Some("http://localhost:1420".into()),
            keepalive: Some(600),
        };
        assert_eq!(
            serve_args(18190, &opts),
            vec![
                "serve",
                "--host",
                "127.0.0.1:18190",
                "--compute",
                "npu",
                "--nctx",
                "4096",
                "--ngl",
                "99",
                "--origins",
                "http://localhost:1420",
                "--keepalive",
                "600",
            ]
        );
    }

    #[test]
    fn track_server_keeps_the_first_server_on_a_port() {
        let mut servers = HashMap::new();
        assert!(track_server(&mut servers, 18181, 100));
        assert!(!track_server(&mut servers, 18181, 200));
        assert_eq!(servers.get(&18181), Some(&100));
    }

    #[test]
    fn track_server_keeps_separate_ports_apart() {
        let mut servers = HashMap::new();
        assert!(track_server(&mut servers, 18181, 100));
        assert!(track_server(&mut servers, 18182, 200));
        assert_eq!(servers.len(), 2);
    }

    #[test]
    fn untrack_server_removes_only_the_matching_pid() {
        let mut servers = HashMap::from([(18181, 100)]);
        assert!(!untrack_server(&mut servers, 18181, 200));
        assert_eq!(servers.get(&18181), Some(&100));
        assert!(untrack_server(&mut servers, 18181, 100));
        assert!(servers.is_empty());
    }

    #[test]
    fn untrack_server_ignores_a_port_with_no_server() {
        let mut servers = HashMap::from([(18181, 100)]);
        assert!(!untrack_server(&mut servers, 18182, 100));
        assert_eq!(servers.len(), 1);
    }

    #[test]
    fn take_all_servers_empties_the_map_ordered_by_port() {
        let mut servers = HashMap::from([(18190, 3), (18181, 1)]);
        assert_eq!(take_all_servers(&mut servers), vec![(18181, 1), (18190, 3)]);
        assert!(servers.is_empty());
    }

    #[test]
    fn tracked_ports_are_ordered() {
        let servers = HashMap::from([(18190, 3), (18181, 1), (18185, 2)]);
        assert_eq!(tracked_ports(&servers), vec![18181, 18185, 18190]);
    }

    #[test]
    fn reserve_free_port_returns_a_port_that_can_be_bound_again() {
        let port = reserve_free_port().expect("a free port");
        assert_ne!(port, 0);
        assert!(std::net::TcpListener::bind(("127.0.0.1", port)).is_ok());
    }
}
