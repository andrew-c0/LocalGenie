use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;

/// Shared download registry: cancel flags per file name.
#[derive(Default)]
pub struct DownloadRegistry {
    pub cancels: Mutex<HashMap<String, std::sync::Arc<AtomicBool>>>,
}

impl DownloadRegistry {
    fn register(&self, file: &str) -> std::sync::Arc<AtomicBool> {
        let flag = std::sync::Arc::new(AtomicBool::new(false));
        self.cancels
            .lock()
            .unwrap()
            .insert(file.to_string(), flag.clone());
        flag
    }

    fn remove(&self, file: &str) {
        self.cancels.lock().unwrap().remove(file);
    }
}

/// Request cancellation of an in-flight download.
#[tauri::command]
pub fn cancel_download(registry: State<'_, DownloadRegistry>, file_name: String) {
    if let Some(flag) = registry.cancels.lock().unwrap().get(&file_name) {
        flag.store(true, Ordering::Relaxed);
    }
}

/// Download a file from `url` to the app's downloads directory, emitting
/// `asset-download-progress` events with received bytes, total, speed and ETA.
/// Supports resume: if a partial file exists, continues from its size via an
/// HTTP Range request. Cancellation keeps the partial file for later resume.
/// Returns the full path of the downloaded file.
#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    url: String,
    file_name: String,
) -> Result<String, String> {
    let dir = download_dir().ok_or("Could not resolve a downloads directory")?;
    let target = dir.join(&file_name);

    // Reuse a fully downloaded file instead of fetching again.
    if target.is_file() {
        return Ok(target.to_string_lossy().into_owned());
    }

    let cancel = registry.register(&file_name);
    let result = run_download(&app, &url, &target, &file_name, &cancel).await;
    registry.remove(&file_name);
    result
}

async fn run_download(
    app: &AppHandle,
    url: &str,
    target: &PathBuf,
    file_name: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    // Resume from an existing partial file, if any.
    let mut resume_from: u64 = 0;
    if target.is_file() {
        resume_from = tokio::fs::metadata(target)
            .await
            .map(|m| m.len())
            .unwrap_or(0);
    }

    let mut req = client.get(url).header("User-Agent", "LocalGenie/0.1");
    if resume_from > 0 {
        req = req.header("Range", format!("bytes={resume_from}-"));
    }

    let mut resp = req
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with status {}", resp.status()));
    }

    // Server ignored the Range request — start over.
    if resume_from > 0 && resp.status() != reqwest::StatusCode::PARTIAL_CONTENT {
        resume_from = 0;
    }

    let total: Option<u64> = resp.content_length().map(|len| len + resume_from);

    let mut file = if resume_from > 0 {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(target)
            .await
            .map_err(|e| format!("Failed to open partial file {:?}: {e}", target))?
    } else {
        tokio::fs::File::create(target)
            .await
            .map_err(|e| format!("Failed to create file {:?}: {e}", target))?
    };

    let mut received: u64 = resume_from;
    let mut last_emit: u64 = 0;
    let mut last_emit_at = std::time::Instant::now();
    let mut speed_bps: f64 = 0.0;

    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = app.emit(
                "asset-download-progress",
                serde_json::json!({ "file": file_name, "cancelled": true }),
            );
            return Err(format!("Download of {file_name} was cancelled"));
        }

        let chunk = match resp.chunk().await {
            Ok(Some(c)) => c,
            Ok(None) => break,
            Err(e) => return Err(format!("Download stream error: {e}")),
        };

        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write file: {e}"))?;
        received += chunk.len() as u64;

        // Emit progress at most every 1 MiB or 500 ms.
        let now = std::time::Instant::now();
        let elapsed = now.duration_since(last_emit_at).as_secs_f64();
        if received - last_emit >= 1_048_576 || elapsed >= 0.5 {
            if elapsed > 0.05 {
                let instant = (received - last_emit) as f64 / elapsed;
                // Exponential moving average for a stable speed readout.
                speed_bps = if speed_bps == 0.0 {
                    instant
                } else {
                    speed_bps * 0.7 + instant * 0.3
                };
            }
            last_emit = received;
            last_emit_at = now;
            let _ = app.emit(
                "asset-download-progress",
                serde_json::json!({
                    "file": file_name,
                    "received": received,
                    "total": total,
                    "speed": speed_bps as u64,
                }),
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {e}"))?;

    let _ = app.emit(
        "asset-download-progress",
        serde_json::json!({
            "file": file_name,
            "received": received,
            "total": total,
            "speed": speed_bps as u64,
            "complete": true,
        }),
    );

    Ok(target.to_string_lossy().into_owned())
}

/// Known-folder lookup for the user's Downloads directory (Windows).
fn download_dir() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)?;
    let dl = home.join("Downloads");
    if dl.is_dir() {
        Some(dl)
    } else {
        None
    }
}

/// Delete a directory (or file) after a successful model pull (the CLI copies into its
/// cache, so the downloaded zip is no longer needed).
#[tauri::command]
pub async fn delete_directory(path: String) -> Result<(), String> {
    match tokio::fs::metadata(&path).await {
        Ok(md) if md.is_dir() => tokio::fs::remove_dir_all(&path)
            .await
            .map_err(|e| format!("Failed to delete directory {path}: {e}")),
        _ => tokio::fs::remove_file(&path)
            .await
            .map_err(|e| format!("Failed to delete file {path}: {e}")),
    }
}

/// Import an already-downloaded GGUF file into the GenieX model cache.
///
/// After downloading, the file is moved into a directory whose name is the base
/// model name (e.g. `llama-3-8b` for `llama-3-8b.Q4_0.gguf`), then registered with
/// GenieX via `geniex pull --model-hub localfs --local-path <dir>`. The caller is
/// responsible for downloading the file first; this function only handles the
/// reorganization and cache registration, plus progress emissions.
#[tauri::command]
pub async fn import_gguf(
    app: AppHandle,
    local_path: String,
    repo_id: String,
    filename: String,
    precision: String,
) -> Result<String, String> {
    // Extract base model name from repo_id (e.g., "qualcomm/Qwen3-4B-Instruct" -> "Qwen3-4B-Instruct")
    let base_model_name = repo_id.split('/').next_back().unwrap_or(&repo_id);

    // Create target directory for the base model (using the downloads directory)
    let downloads_dir = download_dir().ok_or("Could not resolve downloads directory")?;
    let target_dir = downloads_dir.join(base_model_name);

    // Ensure the target directory exists
    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| format!("Failed to create target directory: {e}"))?;

    // Move the downloaded file to the base model name folder,
    // keeping the original filename (e.g. llama-3-8b.Q4_0.gguf)
    let new_path = target_dir.join(&filename);

    // Move the file (rename if in same filesystem, otherwise copy+remove)
    tokio::fs::rename(&local_path, &new_path)
        .await
        .map_err(|e| format!("Failed to move file to base model folder: {e}"))?;

    // Now import from the new location
    let _ = app.emit("model-pull-start", serde_json::json!({ "model": repo_id }));

    let _ = app.emit(
        "model-pull-progress",
        serde_json::json!({ "model": repo_id, "message": "Importing into GenieX cache…" }),
    );

    let exe = super::cli::resolve_geniex_executable();
    let output = tokio::process::Command::new(&exe)
        .args([
            "pull",
            &format!("{repo_id}:{precision}"),
            "--model-hub",
            "localfs",
            "--local-path",
            &target_dir.to_string_lossy(),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to spawn `geniex pull`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Show the full error message in console
        eprintln!("geniex pull failed: {stderr}");
        return Err(format!("`geniex pull` failed: {stderr}"));
    }

    let _ = app.emit(
        "model-pull-complete",
        serde_json::json!({ "model": repo_id }),
    );
    // Return the target directory path for cleanup
    Ok(target_dir.to_string_lossy().into_owned())
}
