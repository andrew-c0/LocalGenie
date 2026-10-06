use std::path::PathBuf;

use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

/// Download a file from `url` to the app's downloads directory, emitting
/// `asset-download-progress` events with the received byte count.
/// If the file already exists locally (from a previous download), it is
/// reused as-is — no network request is made.
/// Returns the full path of the downloaded (or existing) file.
#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    url: String,
    file_name: String,
) -> Result<String, String> {
    let dir = download_dir().ok_or("Could not resolve a downloads directory")?;
    let target = dir.join(&file_name);

    // Reuse an existing download instead of fetching again.
    if target.is_file() {
        return Ok(target.to_string_lossy().into_owned());
    }

    let client = reqwest::Client::new();
    let mut resp = client
        .get(&url)
        .header("User-Agent", "LocalGenie/0.1")
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with status {}", resp.status()));
    }

    let total = resp.content_length();
    let mut file = tokio::fs::File::create(&target)
        .await
        .map_err(|e| format!("Failed to create file {:?}: {e}", target))?;

    let mut received: u64 = 0;
    let mut last_emit: u64 = 0;
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Download stream error: {e}"))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write file: {e}"))?;
        received += chunk.len() as u64;
        // Emit progress at most every 1 MiB to avoid event spam.
        if received - last_emit >= 1_048_576 {
            last_emit = received;
            let _ = app.emit(
                "asset-download-progress",
                serde_json::json!({
                    "file": file_name,
                    "received": received,
                    "total": total,
                }),
            );
        }
    }
    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {e}"))?;

    let path: PathBuf = target;
    Ok(path.to_string_lossy().into_owned())
}

/// Known-folder lookup for the user's Downloads directory (Windows).
fn download_dir() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)?;
    let dl = home.join("Downloads");
    if dl.is_dir() { Some(dl) } else { None }
}

/// Delete a file after a successful model pull (the CLI copies into its
/// cache, so the downloaded zip is no longer needed).
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    tokio::fs::remove_file(&path)
        .await
        .map_err(|e| format!("Failed to delete {path}: {e}"))
}