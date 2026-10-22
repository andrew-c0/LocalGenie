use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;

const USER_AGENT: &str = "LocalGenie/0.1";
/// Downloads may only be requested from this host.
const HF_DOWNLOAD_PREFIX: &str = "https://huggingface.co/";

/// In-flight downloads, keyed by download id (the Hugging Face repo id).
pub struct DownloadRegistry {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// No overall timeout: GGUF files are multi-gigabyte.
    client: reqwest::Client,
}

impl Default for DownloadRegistry {
    fn default() -> Self {
        Self {
            cancels: Mutex::new(HashMap::new()),
            client: reqwest::Client::builder()
                .user_agent(USER_AGENT)
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }
}

impl DownloadRegistry {
    fn lock_cancels(&self) -> Result<MutexGuard<'_, HashMap<String, Arc<AtomicBool>>>, String> {
        self.cancels
            .lock()
            .map_err(|_| "download registry is unavailable".to_string())
    }

    /// Register a download. Fails if the same id is already downloading.
    fn register(&self, download_id: &str) -> Result<Arc<AtomicBool>, String> {
        let mut map = self.lock_cancels()?;
        if map.contains_key(download_id) {
            return Err(format!("{download_id} is already downloading"));
        }
        let flag = Arc::new(AtomicBool::new(false));
        map.insert(download_id.to_string(), flag.clone());
        Ok(flag)
    }

    fn release(&self, download_id: &str) {
        if let Ok(mut map) = self.lock_cancels() {
            map.remove(download_id);
        }
    }
}

/// Accept only a bare file name: no separators, no `..`, no root.
pub(super) fn validate_file_name(name: &str) -> Result<(), String> {
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(format!("Invalid file name: {name}")),
    }
}

/// Resolve a path and require it to sit strictly inside the Downloads folder.
pub(super) fn ensure_inside_downloads(path: &str) -> Result<PathBuf, String> {
    let root = download_dir().ok_or("Could not resolve a downloads directory")?;
    let root = resolve_path(&root)?;
    let resolved = resolve_path(Path::new(path))?;
    if resolved == root || !resolved.starts_with(&root) {
        return Err(format!(
            "Refusing to touch {path}: it is outside the downloads folder"
        ));
    }
    Ok(resolved)
}

fn resolve_path(path: &Path) -> Result<PathBuf, String> {
    std::fs::canonicalize(path).map_err(|e| format!("Cannot resolve {}: {e}", path.display()))
}

/// Request cancellation of an in-flight download. The partial file is kept for resume.
#[tauri::command]
pub fn cancel_download(
    registry: State<'_, DownloadRegistry>,
    download_id: String,
) -> Result<(), String> {
    let map = registry.lock_cancels()?;
    if let Some(flag) = map.get(&download_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// Download `url` into the Downloads folder as `file_name`.
///
/// Bytes are written to `<file_name>.part` and renamed on success, so a partial
/// file is never mistaken for a finished one. A later call for the same file
/// resumes from the `.part` length via an HTTP Range request.
/// Emits `download-progress` events keyed by `download_id`.
#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    download_id: String,
    url: String,
    file_name: String,
) -> Result<String, String> {
    validate_file_name(&file_name)?;
    if !url.starts_with(HF_DOWNLOAD_PREFIX) {
        return Err(format!("Downloads must come from {HF_DOWNLOAD_PREFIX}"));
    }
    let dir = download_dir().ok_or("Could not resolve a downloads directory")?;
    let target = dir.join(&file_name);

    if target.is_file() {
        return Ok(target.to_string_lossy().into_owned());
    }

    let cancel = registry.register(&download_id)?;
    let result = run_download(
        &app,
        &registry.client,
        &url,
        &target,
        &download_id,
        &file_name,
        &cancel,
    )
    .await;
    registry.release(&download_id);
    result
}

async fn run_download(
    app: &AppHandle,
    client: &reqwest::Client,
    url: &str,
    target: &Path,
    download_id: &str,
    file_name: &str,
    cancel: &AtomicBool,
) -> Result<String, String> {
    let partial = target.with_file_name(format!("{file_name}.part"));

    let mut resume_from: u64 = match tokio::fs::metadata(&partial).await {
        Ok(m) => m.len(),
        Err(_) => 0,
    };

    let mut req = client.get(url);
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
            .open(&partial)
            .await
            .map_err(|e| format!("Failed to open partial file {}: {e}", partial.display()))?
    } else {
        tokio::fs::File::create(&partial)
            .await
            .map_err(|e| format!("Failed to create file {}: {e}", partial.display()))?
    };

    let mut received: u64 = resume_from;
    let mut last_emit: u64 = 0;
    let mut last_emit_at = std::time::Instant::now();
    let mut speed_bps: f64 = 0.0;

    loop {
        if cancel.load(Ordering::Relaxed) {
            let _ = app.emit(
                "download-progress",
                serde_json::json!({ "id": download_id, "file": file_name, "cancelled": true }),
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
                "download-progress",
                serde_json::json!({
                    "id": download_id,
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
    drop(file);

    tokio::fs::rename(&partial, target)
        .await
        .map_err(|e| format!("Failed to finalise download: {e}"))?;

    let _ = app.emit(
        "download-progress",
        serde_json::json!({
            "id": download_id,
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
pub(super) fn download_dir() -> Option<PathBuf> {
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

#[cfg(test)]
mod tests {
    use super::validate_file_name;

    #[test]
    fn accepts_bare_file_names() {
        assert!(validate_file_name("model-Q4_0.gguf").is_ok());
    }

    #[test]
    fn rejects_paths_and_traversal() {
        for bad in ["", "..", "../x.gguf", "sub/x.gguf", "/abs.gguf", "."] {
            assert!(validate_file_name(bad).is_err(), "{bad} should be rejected");
        }
    }
}
