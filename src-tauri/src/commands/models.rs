use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use tauri::State;
use tokio::process::Command;
use tokio::time::timeout;

use super::cli::{cli_installed, CLI_NOT_INSTALLED};
use super::constants::GENIEX_COMMAND_TIMEOUT_SECS;
use super::database;
use super::process::hide_console_tokio;
use crate::entities::downloaded_model;

/// Size shown for a model whose size only `geniex list` reports, when the CLI is not installed.
/// The frontend shows it as a dash.
const SIZE_UNKNOWN: &str = "—";

/// Run a `geniex <args>` command to completion, returning its stdout.
/// Maps spawn, exit and timeout failures to a descriptive error string. Refuses with
/// `CLI_NOT_INSTALLED` before starting anything when the CLI is missing.
async fn run_geniex(args: &[&str], what: &str) -> Result<String, String> {
    if !cli_installed() {
        return Err(CLI_NOT_INSTALLED.to_string());
    }
    let mut command = Command::new(super::cli::resolve_geniex_executable());
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    hide_console_tokio(&mut command);
    let run = command.output();
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
pub(super) struct GeniexListModel {
    pub(super) name: String,
    pub(super) size: Option<u64>,
    pub(super) precisions: Option<Vec<String>>,
}

/// Every cached model `geniex list --format json` reports, with its size and precisions.
pub(super) async fn geniex_list() -> Result<Vec<GeniexListModel>, String> {
    let stdout = run_geniex(&["list", "--format", "json"], "list models").await?;
    serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse `geniex list` JSON: {e}"))
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

/// The ModelInfo a stored metadata row gives. Only what the row holds: the size is `SIZE_UNKNOWN`,
/// and the source is the stored facets' source, else the name guess.
fn model_info_from_row(row: &downloaded_model::Model) -> ModelInfo {
    ModelInfo {
        name: row.name.clone(),
        size: SIZE_UNKNOWN.to_string(),
        source: database::source_of_facets(row.facets.as_deref())
            .unwrap_or_else(|| derive_source(&row.name).to_string()),
        precisions: row
            .precision
            .iter()
            .filter(|p| !p.trim().is_empty())
            .cloned()
            .collect(),
    }
}

/// The library list when the GenieX CLI is not installed: one ModelInfo per stored row, sorted by name.
fn stored_model_list(rows: &[downloaded_model::Model]) -> Vec<ModelInfo> {
    let mut models: Vec<ModelInfo> = rows.iter().map(model_info_from_row).collect();
    models.sort_by(|a, b| a.name.cmp(&b.name));
    models
}

/// List all locally downloaded models using `geniex list --format json`.
///
/// When the GenieX CLI is not installed, no process is started: the list comes from the stored
/// metadata rows instead (see `stored_model_list`), with size `SIZE_UNKNOWN`.
///
/// `source` comes from the import that stored the model (`downloaded_models` facets). The name
/// guess (`derive_source`) is only for models with no stored source, such as rows from before it was kept.
#[tauri::command]
pub async fn list_models(db: State<'_, DatabaseConnection>) -> Result<Vec<ModelInfo>, String> {
    if !cli_installed() {
        let rows = database::downloaded_model_rows(&db).await?;
        return Ok(stored_model_list(&rows));
    }
    let raw = geniex_list().await?;
    let stored = match super::database::stored_sources(&db).await {
        Ok(map) => map,
        Err(e) => {
            eprintln!("Could not read stored model sources: {e}");
            Default::default()
        }
    };

    Ok(raw
        .into_iter()
        .map(|m| ModelInfo {
            size: m.size.map(format_size).unwrap_or_else(|| "unknown".into()),
            source: stored
                .get(&m.name)
                .cloned()
                .unwrap_or_else(|| derive_source(&m.name).to_string()),
            precisions: m.precisions.unwrap_or_default(),
            name: m.name,
        })
        .collect())
}

/// The size in bytes of every model `geniex list` reports, by name (the repo, without precision).
/// A model with no stated size counts as 0.
pub(super) async fn installed_model_sizes() -> Result<std::collections::HashMap<String, u64>, String>
{
    Ok(geniex_list()
        .await?
        .into_iter()
        .map(|m| (m.name, m.size.unwrap_or(0)))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn row(name: &str, precision: Option<&str>, facets: Option<&str>) -> downloaded_model::Model {
        downloaded_model::Model {
            name: name.to_string(),
            precision: precision.map(str::to_string),
            context_size: Some(4096),
            param_count: None,
            created_at: 0,
            updated_at: 0,
            repo_url: None,
            model_card: None,
            facets: facets.map(str::to_string),
            base_ram_bytes: None,
            context_ram_bytes: None,
            ram_approximate: None,
        }
    }

    #[test]
    fn stored_row_keeps_name_and_precision_and_leaves_size_unknown() {
        let got = model_info_from_row(&row("org/model", Some("Q4_0"), None));
        assert_eq!(got.name, "org/model");
        assert_eq!(got.size, SIZE_UNKNOWN);
        assert_eq!(got.precisions, vec!["Q4_0".to_string()]);
    }

    #[test]
    fn stored_source_wins_over_the_name_guess() {
        let got = model_info_from_row(&row("org/model", None, Some(r#"{"source":"aihub"}"#)));
        assert_eq!(got.source, "aihub");
    }

    #[test]
    fn name_guess_is_used_without_a_known_stored_source() {
        let no_source = row("qualcomm/Qwen3", None, None);
        assert_eq!(model_info_from_row(&no_source).source, "aihub");

        let facets_without_source = row("org/model", None, Some(r#"{"library":"gguf"}"#));
        assert_eq!(model_info_from_row(&facets_without_source).source, "hf");

        let unknown_stored = row("docker.io/x/y", None, Some(r#"{"source":"localfs"}"#));
        assert_eq!(model_info_from_row(&unknown_stored).source, "docker");
    }

    #[test]
    fn missing_or_blank_precision_gives_no_precisions() {
        assert!(model_info_from_row(&row("org/model", None, None))
            .precisions
            .is_empty());
        assert!(model_info_from_row(&row("org/model", Some("  "), None))
            .precisions
            .is_empty());
    }

    #[test]
    fn stored_list_is_sorted_by_name() {
        let rows = [row("b/two", None, None), row("a/one", None, None)];
        let names: Vec<String> = stored_model_list(&rows)
            .into_iter()
            .map(|m| m.name)
            .collect();
        assert_eq!(names, ["a/one", "b/two"]);
    }
}
