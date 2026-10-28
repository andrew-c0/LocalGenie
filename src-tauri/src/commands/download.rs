use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;

const USER_AGENT: &str = "LocalGenie/0.1";
/// Downloads may only be requested from these prefixes: Hugging Face (GGUF files) and the public
/// AI Hub asset bucket (QAIRT zips).
const HF_DOWNLOAD_PREFIX: &str = "https://huggingface.co/";
const AIHUB_DOWNLOAD_PREFIX: &str = "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/";

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
    pub(super) fn register(&self, download_id: &str) -> Result<Arc<AtomicBool>, String> {
        let mut map = self.lock_cancels()?;
        if map.contains_key(download_id) {
            return Err(format!("{download_id} is already downloading"));
        }
        let flag = Arc::new(AtomicBool::new(false));
        map.insert(download_id.to_string(), flag.clone());
        Ok(flag)
    }

    pub(super) fn release(&self, download_id: &str) {
        if let Ok(mut map) = self.lock_cancels() {
            map.remove(download_id);
        }
    }

    /// The shared download client (no total timeout).
    pub(super) fn client(&self) -> &reqwest::Client {
        &self.client
    }
}

/// True for a URL under one of the allowed download prefixes.
fn is_allowed_download_url(url: &str) -> bool {
    url.starts_with(HF_DOWNLOAD_PREFIX) || url.starts_with(AIHUB_DOWNLOAD_PREFIX)
}

/// Accept only a bare file name: no separators, no `..`, no root.
pub(super) fn validate_file_name(name: &str) -> Result<(), String> {
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(format!("Invalid file name: {name}")),
    }
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

/// Download `url` into `folder` inside the Downloads folder, as `file_name`.
///
/// Bytes are written to `<file_name>.part` and renamed on success, so a partial
/// file is never mistaken for a finished one. A later call for the same file
/// resumes from the `.part` length via an HTTP Range request.
/// Emits `download-progress` events keyed by `download_id`.
#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    aihub: State<'_, super::aihub::AihubCache>,
    download_id: String,
    url: String,
    folder: String,
    file_name: String,
) -> Result<String, String> {
    validate_file_name(&folder)?;
    validate_file_name(&file_name)?;
    if !is_allowed_download_url(&url) {
        return Err(format!(
            "Downloads must come from {HF_DOWNLOAD_PREFIX} or {AIHUB_DOWNLOAD_PREFIX}"
        ));
    }
    // AI Hub URLs are narrowed further: only this device's asset zips of models opened in the app.
    if url.starts_with(AIHUB_DOWNLOAD_PREFIX) {
        super::aihub::check_asset_download(&aihub, &url).await?;
    }
    let dir = download_dir()
        .ok_or("Could not resolve a downloads directory")?
        .join(&folder);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
    let target = dir.join(&file_name);

    if target.is_file() {
        return Ok(target.to_string_lossy().into_owned());
    }

    let cancel = registry.register(&download_id)?;
    let result = run_download(
        &app,
        registry.client(),
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

/// Byte counts of one transfer. `total` is `None` when the server does not state a length.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct TransferProgress {
    pub received: u64,
    pub total: Option<u64>,
    pub speed_bps: u64,
}

/// How a transfer ended. A cancelled transfer keeps its partial file for a later resume.
#[derive(Debug, PartialEq)]
pub(super) enum Transfer {
    Finished(TransferProgress),
    Cancelled,
}

/// Streams `url` into `partial`, resuming from the file's length with an HTTP Range request when
/// the file already exists. `on_progress` is called at most every 1 MiB or 500 ms. `cancel`, when
/// given, is checked between chunks. The caller renames `partial` once the transfer has finished.
pub(super) async fn stream_to_partial(
    client: &reqwest::Client,
    url: &str,
    partial: &Path,
    cancel: Option<&AtomicBool>,
    mut on_progress: impl FnMut(TransferProgress),
) -> Result<Transfer, String> {
    let mut resume_from: u64 = tokio::fs::metadata(partial)
        .await
        .map(|m| m.len())
        .unwrap_or(0);

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
            .open(partial)
            .await
            .map_err(|e| format!("Failed to open partial file {}: {e}", partial.display()))?
    } else {
        tokio::fs::File::create(partial)
            .await
            .map_err(|e| format!("Failed to create file {}: {e}", partial.display()))?
    };

    let mut received: u64 = resume_from;
    let mut last_emit: u64 = 0;
    let mut last_emit_at = Instant::now();
    let mut speed_bps: f64 = 0.0;

    loop {
        if cancel.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
            return Ok(Transfer::Cancelled);
        }

        let chunk = resp
            .chunk()
            .await
            .map_err(|e| format!("Download stream error: {e}"))?;
        let Some(chunk) = chunk else { break };

        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write file: {e}"))?;
        received += chunk.len() as u64;

        // Report progress at most every 1 MiB or 500 ms.
        let now = Instant::now();
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
            on_progress(TransferProgress {
                received,
                total,
                speed_bps: speed_bps as u64,
            });
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {e}"))?;
    drop(file);

    Ok(Transfer::Finished(TransferProgress {
        received,
        total,
        speed_bps: speed_bps as u64,
    }))
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
    let emit_progress = |progress: TransferProgress| {
        let _ = app.emit(
            "download-progress",
            serde_json::json!({
                "id": download_id,
                "file": file_name,
                "received": progress.received,
                "total": progress.total,
                "speed": progress.speed_bps,
            }),
        );
    };

    match stream_to_partial(client, url, &partial, Some(cancel), emit_progress).await? {
        Transfer::Cancelled => {
            let _ = app.emit(
                "download-progress",
                serde_json::json!({ "id": download_id, "file": file_name, "cancelled": true }),
            );
            Err(format!("Download of {file_name} was cancelled"))
        }
        Transfer::Finished(last) => {
            tokio::fs::rename(&partial, target)
                .await
                .map_err(|e| format!("Failed to finalise download: {e}"))?;

            let _ = app.emit(
                "download-progress",
                serde_json::json!({
                    "id": download_id,
                    "file": file_name,
                    "received": last.received,
                    "total": last.total,
                    "speed": last.speed_bps,
                    "complete": true,
                }),
            );
            Ok(target.to_string_lossy().into_owned())
        }
    }
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
    fn allows_only_hugging_face_and_ai_hub_asset_urls() {
        use super::is_allowed_download_url;
        assert!(is_allowed_download_url(
            "https://huggingface.co/owner/repo/resolve/main/model.gguf"
        ));
        assert!(is_allowed_download_url(
            "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/a/b.zip"
        ));
        assert!(!is_allowed_download_url("https://example.com/model.zip"));
        assert!(!is_allowed_download_url("http://huggingface.co/x.gguf"));
    }

    #[test]
    fn rejects_paths_and_traversal() {
        for bad in ["", "..", "../x.gguf", "sub/x.gguf", "/abs.gguf", "."] {
            assert!(validate_file_name(bad).is_err(), "{bad} should be rejected");
        }
    }
}
