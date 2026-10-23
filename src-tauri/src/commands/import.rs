use sea_orm::DatabaseConnection;
use tauri::{AppHandle, Emitter, State};

use std::path::Path;

use super::download::{download_dir, ensure_inside_downloads, validate_file_name};
use super::{database, AppState};

/// Delete a directory or file inside the Downloads folder (after a model import).
#[tauri::command]
pub async fn delete_directory(path: String) -> Result<(), String> {
    let resolved = ensure_inside_downloads(&path)?;
    let md = tokio::fs::metadata(&resolved)
        .await
        .map_err(|e| format!("Failed to read {path}: {e}"))?;
    if md.is_dir() {
        tokio::fs::remove_dir_all(&resolved)
            .await
            .map_err(|e| format!("Failed to delete directory {path}: {e}"))
    } else {
        tokio::fs::remove_file(&resolved)
            .await
            .map_err(|e| format!("Failed to delete file {path}: {e}"))
    }
}

/// Import an already-downloaded GGUF file into the GenieX model cache.
///
/// The file, and each sidecar (e.g. a multimodal projector), is moved into
/// `<Downloads>/<base-model>/` before it is registered with
/// `geniex pull <repo>:<precision> --model-hub localfs --local-path <dir>`.
/// GenieX copies only what is in that folder, so sidecars must be moved in first.
/// The model card is fetched best-effort; a missing README does not fail the import.
// Each argument is a separate Tauri IPC field; bundling them would change the frontend contract.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn import_gguf(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, DatabaseConnection>,
    local_path: String,
    repo_id: String,
    filename: String,
    precision: String,
    sidecar_paths: Vec<String>,
) -> Result<String, String> {
    // Extract base model name from repo_id (e.g., "qualcomm/Qwen3-4B-Instruct" -> "Qwen3-4B-Instruct")
    let base_model_name = repo_id.split('/').next_back().unwrap_or(&repo_id);
    validate_file_name(base_model_name)?;
    validate_file_name(&filename)?;

    let source = ensure_inside_downloads(&local_path)?;
    // Validate every sidecar before anything moves, so a bad path leaves the main file in place.
    let mut sidecars = Vec::with_capacity(sidecar_paths.len());
    for path in &sidecar_paths {
        let from = ensure_inside_downloads(path)?;
        let name = sidecar_file_name(&from)?;
        sidecars.push((from, name));
    }
    let downloads_dir = download_dir().ok_or("Could not resolve downloads directory")?;
    let target_dir = downloads_dir.join(base_model_name);

    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| format!("Failed to create target directory: {e}"))?;

    for (from, name) in &sidecars {
        let to = target_dir.join(name);
        tokio::fs::rename(from, &to)
            .await
            .map_err(|e| format!("Failed to move sidecar {name} to base model folder: {e}"))?;
    }

    let new_path = target_dir.join(&filename);
    tokio::fs::rename(&source, &new_path)
        .await
        .map_err(|e| format!("Failed to move file to base model folder: {e}"))?;

    // Read the native context length now: the frontend deletes this folder once the import finishes.
    let header_path = new_path.clone();
    let context_size = match tokio::task::spawn_blocking(move || {
        crate::gguf::read_context_length(&header_path)
    })
    .await
    {
        Ok(Ok(size)) => size,
        Ok(Err(e)) => {
            eprintln!("Could not read GGUF context length: {e}");
            None
        }
        Err(e) => {
            eprintln!("GGUF header task failed: {e}");
            None
        }
    };

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
        eprintln!("geniex pull failed: {stderr}");
        return Err(format!("`geniex pull` failed: {stderr}"));
    }

    let repo_url = format!("https://huggingface.co/{repo_id}");
    let readme_url = format!("https://huggingface.co/{repo_id}/raw/main/README.md");
    let model_card = match state
        .http_client
        .get(&readme_url)
        .timeout(std::time::Duration::from_secs(super::constants::HTTP_TIMEOUT_SECS))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp.text().await.ok(),
        _ => None,
    }
    .filter(|s| !s.trim().is_empty());

    if let Err(e) = database::upsert_downloaded_model(
        db,
        repo_id.clone(),
        Some(precision.clone()),
        context_size,
        None,
        Some(repo_url),
        model_card,
    )
    .await
    {
        eprintln!("Failed to upsert downloaded model metadata: {e}");
    }

    // Emitted last: listeners read the metadata row as soon as this fires.
    let _ = app.emit(
        "model-pull-complete",
        serde_json::json!({ "model": repo_id }),
    );

    Ok(target_dir.to_string_lossy().into_owned())
}

/// The bare file name a sidecar keeps inside the model folder. Rejects paths with no usable name.
fn sidecar_file_name(path: &Path) -> Result<String, String> {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid sidecar path: {}", path.display()))?;
    validate_file_name(name)?;
    Ok(name.to_string())
}

#[cfg(test)]
mod tests {
    use super::sidecar_file_name;
    use std::path::Path;

    #[test]
    fn keeps_the_basename_of_a_sidecar() {
        let name = sidecar_file_name(Path::new("C:/Users/me/Downloads/mmproj-F16.gguf"));
        assert_eq!(name.as_deref(), Ok("mmproj-F16.gguf"));
    }

    #[test]
    fn rejects_paths_without_a_usable_file_name() {
        for bad in ["C:/", "/", "C:/Users/me/Downloads/.."] {
            assert!(sidecar_file_name(Path::new(bad)).is_err(), "{bad} should be rejected");
        }
    }
}
