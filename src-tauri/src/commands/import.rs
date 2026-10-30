use sea_orm::DatabaseConnection;
use tauri::{AppHandle, Emitter, State};

use std::path::Path;

use super::download::{download_dir, validate_file_name};
use super::{database, AppState};

/// What `import_gguf_files` imports: a repo's GGUF and projector files in one Downloads folder.
#[derive(Debug, Clone, Copy)]
pub(super) struct GgufImport<'a> {
    /// The repo's download folder: one name under Downloads.
    pub folder: &'a str,
    pub repo_id: &'a str,
    pub filename: &'a str,
    pub precision: &'a str,
    /// The projector files the download step put in `folder`.
    pub sidecar_names: &'a [String],
    pub facets: Option<&'a str>,
}

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
    facets: Option<String>,
) -> Result<(), String> {
    import_gguf_files(
        &app,
        &state.http_client,
        &db,
        GgufImport {
            folder: &folder,
            repo_id: &repo_id,
            filename: &filename,
            precision: &precision,
            sidecar_names: &sidecar_names,
            facets: facets.as_deref(),
        },
    )
    .await
}

/// The import behind `import_gguf`, also used by the Playground's OCR model download. Emits
/// `model-pull-start`, `model-pull-progress` and, once the metadata row is stored,
/// `model-pull-complete`, which the Models tab listens to.
pub(super) async fn import_gguf_files(
    app: &AppHandle,
    client: &reqwest::Client,
    db: &DatabaseConnection,
    import: GgufImport<'_>,
) -> Result<(), String> {
    let GgufImport {
        folder,
        repo_id,
        filename,
        precision,
        sidecar_names,
        facets,
    } = import;
    // The folder is one name under Downloads, so nothing outside it can be reached.
    validate_file_name(folder)?;
    validate_file_name(filename)?;
    for name in sidecar_names {
        validate_file_name(name)?;
    }
    // This is the Hugging Face import, so the source is set here, not derived from the name.
    let facets = Some(database::facets_with_source(facets, database::SOURCE_HF)?);
    // Not canonicalised: on Windows that adds a `\?\` prefix the GenieX CLI may not accept.
    let dir = download_dir()
        .ok_or("Could not resolve downloads directory")?
        .join(folder);
    if !dir.is_dir() {
        return Err(format!("Download folder {} is missing", dir.display()));
    }

    remove_other_projectors(&dir, sidecar_names)?;

    // Read the native context length now, before GenieX runs.
    let header_path = dir.join(filename);
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

    pull_local(&dir, repo_id, precision).await?;

    let repo_url = format!("https://huggingface.co/{repo_id}");
    let readme_url = format!("https://huggingface.co/{repo_id}/raw/main/README.md");
    let model_card = match client
        .get(&readme_url)
        .timeout(std::time::Duration::from_secs(super::constants::HTTP_TIMEOUT_SECS))
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => resp.text().await.ok(),
        _ => None,
    }
    .filter(|s| !s.trim().is_empty());

    if let Err(e) = database::store_downloaded_model(
        db,
        database::DownloadedModelRow {
            name: repo_id.to_string(),
            precision: Some(precision.to_string()),
            context_size,
            param_count: None,
            repo_url: Some(repo_url),
            model_card,
            facets,
        },
    )
    .await
    {
        eprintln!("Failed to upsert downloaded model metadata: {e}");
    }

    // GenieX has its copies now. Remove this variant's files from the download folder.
    remove_variant_files(&dir, filename, sidecar_names).await;

    // Emitted last: listeners read the metadata row as soon as this fires.
    let _ = app.emit(
        "model-pull-complete",
        serde_json::json!({ "model": repo_id }),
    );

    Ok(())
}

/// Import a QAIRT zip that the download step put in `folder` (inside Downloads) into the GenieX
/// cache as `model_name`, e.g. `qualcomm/Qwen3-0.6B`. GenieX reads the AI Hub `.zip` directly, so
/// it is not extracted. The zip is removed only after GenieX has copied it. A failed import keeps
/// it, so a retry reuses the download.
#[tauri::command]
pub async fn import_aihub_zip(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    folder: String,
    zip_name: String,
    model_name: String,
    precision: String,
    facets: Option<String>,
) -> Result<(), String> {
    validate_file_name(&folder)?;
    validate_file_name(&zip_name)?;
    validate_aihub_model_name(&model_name)?;
    validate_precision(&precision)?;
    // This command is the AI Hub import, so the source is set here, not derived from the name.
    let facets = Some(database::facets_with_source(
        facets.as_deref(),
        database::SOURCE_AIHUB,
    )?);
    let dir = download_dir()
        .ok_or("Could not resolve downloads directory")?
        .join(&folder);
    let zip = dir.join(&zip_name);
    if !zip.is_file() {
        return Err(format!("Downloaded file {} is missing", zip.display()));
    }

    let _ = app.emit(
        "model-pull-start",
        serde_json::json!({ "model": model_name }),
    );
    let _ = app.emit(
        "model-pull-progress",
        serde_json::json!({ "model": model_name, "message": "Importing into GenieX cache…" }),
    );

    pull_local(&zip, &model_name, &precision).await?;

    // AI Hub zips carry no GGUF header and no repo, so the row has only the name, precision and facets.
    if let Err(e) = database::upsert_downloaded_model(
        db,
        model_name.clone(),
        Some(precision),
        None,
        None,
        None,
        None,
        facets,
    )
    .await
    {
        eprintln!("Failed to upsert downloaded model metadata: {e}");
    }

    // GenieX has its copy now. Remove the zip, and the folder when it is empty.
    remove_variant_files(&dir, &zip_name, &[]).await;

    // Emitted last: listeners read the metadata row as soon as this fires.
    let _ = app.emit(
        "model-pull-complete",
        serde_json::json!({ "model": model_name }),
    );

    Ok(())
}

/// `geniex pull <model>:<precision> --model-hub localfs --local-path <path>`. `local_path` is a
/// folder (HF GGUF or extracted AI Hub) or an AI Hub `.zip`. A failure returns GenieX's stderr.
async fn pull_local(local_path: &Path, model_name: &str, precision: &str) -> Result<(), String> {
    let exe = super::cli::resolve_geniex_executable();
    let output = tokio::process::Command::new(&exe)
        .args([
            "pull",
            &format!("{model_name}:{precision}"),
            "--model-hub",
            "localfs",
            "--local-path",
            &local_path.to_string_lossy(),
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
    Ok(())
}

/// A GenieX AI Hub name: `qualcomm/<display name>`. The display name keeps letters, digits, `.`,
/// `-` and `_` (for example `Qwen3-0.6B`), with no leading dot.
fn validate_aihub_model_name(name: &str) -> Result<(), String> {
    let display = name
        .strip_prefix("qualcomm/")
        .ok_or_else(|| format!("Invalid AI Hub model name: {name}"))?;
    let ok = !display.is_empty()
        && !display.starts_with('.')
        && display
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if ok {
        Ok(())
    } else {
        Err(format!("Invalid AI Hub model name: {name}"))
    }
}

/// A QAIRT precision label such as `W4A16`. It becomes part of the `geniex pull` argument.
fn validate_precision(precision: &str) -> Result<(), String> {
    let ok = !precision.is_empty()
        && precision
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_');
    if ok {
        Ok(())
    } else {
        Err(format!("Invalid precision: {precision}"))
    }
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

#[cfg(test)]
mod tests {
    use super::{validate_aihub_model_name, validate_precision};

    #[test]
    fn aihub_model_names_are_qualcomm_display_names() {
        assert!(validate_aihub_model_name("qualcomm/Qwen3-0.6B").is_ok());
        assert!(validate_aihub_model_name("qualcomm/Qwen3-4B").is_ok());
        assert!(validate_aihub_model_name("Qwen3-4B").is_err());
        assert!(validate_aihub_model_name("qualcomm/").is_err());
        assert!(validate_aihub_model_name("qualcomm/../x").is_err());
        assert!(validate_aihub_model_name("qualcomm/a:w4a16").is_err());
        assert!(validate_aihub_model_name("qualcomm/a b").is_err());
    }

    #[test]
    fn precision_is_a_plain_label() {
        assert!(validate_precision("W4A16").is_ok());
        assert!(validate_precision("").is_err());
        assert!(validate_precision("W4A16:x").is_err());
    }
}
