use super::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::process::Command;

/// Status of the GenieX serve process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: u16,
    pub models: Vec<String>,
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

/// Start the `geniex serve` process in the background.
#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, AppState>,
    options: Option<ServerStartOptions>,
) -> Result<ServerStatus, String> {
    let opts = options.unwrap_or_default();
    let port = opts.port;
    let serve_port = port.unwrap_or(super::constants::DEFAULT_PORT);

    // A server already answering on the port (ours or external) is reused.
    if fetch_loaded_models(&state.http_client, &local_base_url(serve_port))
        .await
        .is_ok()
    {
        return get_server_status(state, port).await;
    }

    // Our tracked process is cleared by its exit watcher, so a tracked PID means it is alive.
    if tracked_pid(&state)?.is_some() {
        return get_server_status(state, port).await;
    }

    let host = format!("127.0.0.1:{serve_port}");
    let mut args = vec!["serve".to_string(), "--host".into(), host];

    if let Some(ref c) = opts.compute {
        args.push("--compute".into());
        args.push(c.clone());
    }
    if let Some(n) = opts.nctx {
        args.push("--nctx".into());
        args.push(n.to_string());
    }
    if let Some(n) = opts.ngl {
        args.push("--ngl".into());
        args.push(n.to_string());
    }
    if let Some(ref o) = opts.origins {
        args.push("--origins".into());
        args.push(o.clone());
    }
    if let Some(k) = opts.keepalive {
        args.push("--keepalive".into());
        args.push(k.to_string());
    }

    let mut child = Command::new(super::cli::resolve_geniex_executable())
        .args(&args)
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
    {
        let mut proc = state
            .server_process
            .lock()
            .map_err(|_| "server state is unavailable".to_string())?;
        *proc = Some(pid);
    }

    if let Some(stdout) = child.stdout.take() {
        forward_lines(app.clone(), stdout, "stdout");
    }
    if let Some(stderr) = child.stderr.take() {
        forward_lines(app.clone(), stderr, "stderr");
    }

    // When the process exits, forget its PID so the next start actually spawns.
    tokio::spawn(async move {
        let _ = child.wait().await;
        // A user stop (unload) takes the PID out of the state before killing the process, so
        // only an exit we did not ask for still finds it here and is reported.
        let unexpected = app
            .state::<AppState>()
            .server_process
            .lock()
            .map(|mut proc| {
                if *proc == Some(pid) {
                    *proc = None;
                    true
                } else {
                    false
                }
            })
            .unwrap_or(false);
        if unexpected {
            let _ = app.emit("server-stopped", ());
        }
    });

    // Poll for readiness instead of a fixed sleep.
    for _ in 0..super::constants::SERVER_STARTUP_PROBES {
        tokio::time::sleep(std::time::Duration::from_millis(
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
    get_server_status(state, port).await
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

fn tracked_pid(state: &AppState) -> Result<Option<u32>, String> {
    state
        .server_process
        .lock()
        .map(|proc| *proc)
        .map_err(|_| "server state is unavailable".to_string())
}

/// Stop the running `geniex serve` process.
#[tauri::command]
pub async fn stop_server(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<ServerStatus, String> {
    let serve_port = port.unwrap_or(super::constants::DEFAULT_PORT);
    let pid = {
        let mut proc = state
            .server_process
            .lock()
            .map_err(|_| "server state is unavailable".to_string())?;
        proc.take()
    };

    if let Some(pid) = pid {
        kill_process(pid).await;
    }

    Ok(ServerStatus {
        running: false,
        port: serve_port,
        models: vec![],
    })
}

/// Report whether a server answers on the port and which models it has loaded.
/// Works regardless of whether we spawned the server or it's running externally.
#[tauri::command]
pub async fn get_server_status(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<ServerStatus, String> {
    let serve_port = port.unwrap_or(super::constants::DEFAULT_PORT);

    match fetch_loaded_models(&state.http_client, &local_base_url(serve_port)).await {
        Ok(models) => Ok(ServerStatus {
            running: true,
            port: serve_port,
            models,
        }),
        Err(_) => Ok(ServerStatus {
            running: false,
            port: serve_port,
            models: vec![],
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::loaded_ids;
    use serde_json::json;

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
}
