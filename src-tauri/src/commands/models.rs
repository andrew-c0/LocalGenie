use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

use super::constants::GENIEX_COMMAND_TIMEOUT_SECS;

/// Run a `geniex <args>` command to completion, returning its stdout.
/// Maps spawn, exit and timeout failures to a descriptive error string.
async fn run_geniex(args: &[&str], what: &str) -> Result<String, String> {
    let run = Command::new(super::cli::resolve_geniex_executable())
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .output();
    let output = timeout(Duration::from_secs(GENIEX_COMMAND_TIMEOUT_SECS), run)
        .await
        .map_err(|_| format!("`geniex {}` timed out: {what}", args.join(" ")))?
        .map_err(|e| format!("Failed to run `geniex {}`: {e}", args.join(" ")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "`geniex {}` failed: {what}: {stderr}",
            args.join(" ")
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Information about a single downloaded model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub name: String,
    pub size: String,
    /// `hf` | `aihub` | `docker` | `localfs`
    pub source: String,
    pub precisions: Vec<String>,
}

/// Raw JSON object returned by `geniex list --format json`.
#[derive(Debug, Deserialize)]
struct GeniexListModel {
    name: String,
    size: Option<u64>,
    precisions: Option<Vec<String>>,
}
/// Format bytes into a human-readable size string.
fn format_size(bytes: u64) -> String {
    const GB: u64 = 1_073_741_824;
    const MB: u64 = 1_048_576;
    if bytes >= GB {
        format!("{:.1} GiB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MiB", bytes as f64 / MB as f64)
    } else {
        format!("{bytes} B")
    }
}

/// Derive the model source from its name prefix.
pub(super) fn derive_source(name: &str) -> &str {
    if name.starts_with("ai-hub-models/") || name.starts_with("qualcomm/") {
        "aihub"
    } else if name.starts_with("docker.io/") || name.contains("/ai/") {
        "docker"
    } else {
        "hf"
    }
}

/// List all locally downloaded models using `geniex list --format json`.
#[tauri::command]
pub async fn list_models() -> Result<Vec<ModelInfo>, String> {
    let stdout = run_geniex(&["list", "--format", "json"], "list models").await?;

    let raw: Vec<GeniexListModel> = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse `geniex list` JSON: {e}"))?;

    Ok(raw
        .into_iter()
        .map(|m| ModelInfo {
            size: m.size.map(format_size).unwrap_or_else(|| "unknown".into()),
            source: derive_source(&m.name).to_string(),
            precisions: m.precisions.unwrap_or_default(),
            name: m.name,
        })
        .collect())
}

/// One Qualcomm AI Hub model that GenieX can run on this chipset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AihubModel {
    /// Fully-qualified HF-style id, e.g. `qualcomm/Qwen3-4B-Instruct-2507`.
    pub name: String,
    /// `llm` | `vlm`
    pub model_type: String,
}

/// List Qualcomm AI Hub models compatible with the current chipset.
/// Parses the table emitted by `geniex model list` (no JSON output available).
#[tauri::command]
pub async fn list_aihub_models() -> Result<Vec<AihubModel>, String> {
    let stdout = run_geniex(&["model", "list"], "list AI Hub models").await?;

    // Rows look like: `│ qualcomm/Falcon3-7B-Instruct            │  llm │`
    Ok(stdout
        .lines()
        .filter(|l| l.trim_start().starts_with('│'))
        .filter_map(|line| {
            let cells: Vec<&str> = line.split('│').collect();
            if cells.len() < 3 {
                return None;
            }
            let name = cells[1].trim();
            let model_type = cells[2].trim();
            if name.is_empty() || name == "NAME" {
                return None;
            }
            Some(AihubModel {
                name: name.to_string(),
                model_type: model_type.to_string(),
            })
        })
        .collect())
}

/// Remove ALL cached models, freeing up local storage.
#[tauri::command]
pub async fn clean_models() -> Result<(), String> {
    run_geniex(&["clean", "-y"], "clean models")
        .await
        .map(|_| ())
}

/// Override the model type (llm or vlm) for a cached model.
#[tauri::command]
pub async fn set_model_type(model: String, model_type: String) -> Result<(), String> {
    run_geniex(
        &["model", "set-type", &model, &model_type],
        "set model type",
    )
    .await
    .map(|_| ())
}

/// Remove a locally downloaded model.
#[tauri::command]
pub async fn remove_model(model: String) -> Result<(), String> {
    run_geniex(&["remove", &model, "-y"], "remove model")
        .await
        .map(|_| ())
}
