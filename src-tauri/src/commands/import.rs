use sea_orm::DatabaseConnection;
use tauri::{AppHandle, Emitter, State};

use std::path::Path;

use super::download::{download_dir, validate_file_name};
use super::{database, AppState};

/// Import a repo's downloaded GGUF into the GenieX model cache.
///
/// `folder` is the repo's download folder under Downloads. It holds `filename` and the projector
/// files in `sidecar_names`, which the download step put there. GenieX reads the whole folder, so
/// projectors left by other variants of the repo are removed first. After GenieX has copied the
/// files, this variant's copies are removed, and the folder too when nothing else is left in it.
/// A failed import keeps its files, so a retry reuses them.
// Each argument is a separate Tauri IPC field; bundling them would change the frontend contract.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn import_gguf(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, DatabaseConnection>,
    folder: String,
    repo_id: String,
    filename: String,
    precision: String,
    sidecar_names: Vec<String>,
) -> Result<(), String> {
    // The folder is one name under Downloads, so nothing outside it can be reached.
    validate_file_name(&folder)?;
    validate_file_name(&filename)?;
    for name in &sidecar_names {
        validate_file_name(name)?;
    }
    // Not canonicalised: on Windows that adds a `\\?\` prefix the GenieX CLI may not accept.
    let dir = download_dir()
        .ok_or("Could not resolve downloads directory")?
        .join(&folder);
    if !dir.is_dir() {
        return Err(format!("Download folder {} is missing", dir.display()));
    }

    remove_other_projectors(&dir, &sidecar_names)?;

    // Read the native context length now, before GenieX runs.
    let header_path = dir.join(&filename);
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
            &dir.to_string_lossy(),
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

    // GenieX has its copies now. Remove this variant's files from the download folder.
    remove_variant_files(&dir, &filename, &sidecar_names).await;

    // Emitted last: listeners read the metadata row as soon as this fires.
    let _ = app.emit(
        "model-pull-complete",
        serde_json::json!({ "model": repo_id }),
    );

    Ok(())
}

/// Remove projector files in `dir` that are not in `keep`. GenieX picks one projector from the
/// folder, so a projector from another variant must not sit next to this variant's.
fn remove_other_projectors(dir: &Path, keep: &[String]) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read {}: {e}", dir.display()))?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.to_lowercase().contains("mmproj") && !keep.contains(&name) {
            std::fs::remove_file(entry.path())
                .map_err(|e| format!("Failed to remove {name}: {e}"))?;
        }
    }
    Ok(())
}

/// Remove this variant's model and projector files from `dir`, then `dir` itself if it is empty.
/// Other variants' files, such as an unfinished download, stay where they are.
async fn remove_variant_files(dir: &Path, filename: &str, sidecar_names: &[String]) {
    let _ = tokio::fs::remove_file(dir.join(filename)).await;
    for name in sidecar_names {
        let _ = tokio::fs::remove_file(dir.join(name)).await;
    }
    let _ = tokio::fs::remove_dir(dir).await;
}
