use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

/// Run a `geniex <args>` command to completion, returning its stdout.
/// Maps spawn/exit failures to a descriptive error string.
async fn run_geniex(args: &[&str], what: &str) -> Result<String, String> {
    let output = Command::new(super::cli::resolve_geniex_executable())
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run `geniex {}`: {e}", args.join(" ")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("`geniex {}` failed: {what}: {stderr}", args.join(" ")));
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

/// Search result from Hugging Face.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchModel {
    pub id: String,
    pub name: String,
    pub downloads: Option<u64>,
    pub likes: Option<u64>,
    pub tags: Option<Vec<String>>,
    pub pipeline_tag: Option<String>,
}

/// Raw JSON object returned by `geniex list --format json`.
#[derive(Debug, Deserialize)]
struct GeniexListModel {
    name: String,
    size: Option<u64>,
    #[allow(dead_code)]
    runtime: Option<String>,
    #[allow(dead_code)]
    r#type: Option<String>,
    #[allow(dead_code)]
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
fn derive_source(name: &str) -> &str {
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

    let models = raw
        .into_iter()
        .map(|m| {
            let size_str = m.size.map(format_size).unwrap_or_else(|| "unknown".into());
            let source = derive_source(&m.name).to_string();
            let precisions = m.precisions.unwrap_or_default();
            ModelInfo {
                name: m.name,
                size: size_str,
                source,
                precisions,
            }
        })
        .collect();

    Ok(models)
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
    let models = stdout
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
        .collect();

    Ok(models)
}

/// Remove ALL cached models, freeing up local storage.
#[tauri::command]
pub async fn clean_models() -> Result<(), String> {
    run_geniex(&["clean", "-y"], "clean models").await.map(|_| ())
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

/// Pull (download) a model.
/// Emits `model-pull-progress` events as the download progresses.
#[tauri::command]
pub async fn pull_model(
    app: AppHandle,
    model: String,
    precision: Option<String>,
    model_hub: Option<String>,
    model_type: Option<String>,
    local_path: Option<String>,
) -> Result<(), String> {
    let target = match precision {
        Some(p) => format!("{model}:{p}"),
        None => model.clone(),
    };

    let mut args = vec!["pull".to_string(), target];
    if let Some(hub) = model_hub {
        args.push("--model-hub".into());
        args.push(hub);
    }
    if let Some(mt) = model_type {
        args.push("--model-type".into());
        args.push(mt);
    }
    if let Some(lp) = local_path {
        args.push("--local-path".into());
        args.push(lp);
    }

    let mut child = Command::new(super::cli::resolve_geniex_executable())
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn `geniex pull`: {e}"))?;

    // Emit start event
    let _ = app.emit(
        "model-pull-start",
        serde_json::json!({ "model": model }),
    );

    // Drain stderr concurrently — if it fills its pipe buffer the child
    // blocks and the pull never finishes.
    let stderr_stream = child.stderr.take();
    let stderr_handle = tokio::spawn(async move {
        let mut buf = String::new();
        if let Some(mut stderr) = stderr_stream {
            use tokio::io::AsyncReadExt;
            let _ = stderr.read_to_string(&mut buf).await;
        }
        buf
    });

    // Read output line by line and emit progress
    if let Some(stdout) = child.stdout.take() {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut reader = BufReader::new(stdout).lines();

        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app.emit(
                "model-pull-progress",
                serde_json::json!({ "model": model, "message": line }),
            );
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("`geniex pull` error: {e}"))?;

    let stderr = stderr_handle.await.unwrap_or_default();

    if status.success() {
        let _ = app.emit(
            "model-pull-complete",
            serde_json::json!({ "model": model }),
        );
        Ok(())
    } else {
        Err(format!("`geniex pull` failed: {stderr}"))
    }
}

/// Remove a locally downloaded model.
#[tauri::command]
pub async fn remove_model(model: String) -> Result<(), String> {
    run_geniex(&["remove", &model, "-y"], "remove model").await.map(|_| ())
}

/// Search Hugging Face for GGUF models.
/// Uses the HF API directly (no CLI dependency).
#[tauri::command]
pub async fn search_models(query: String) -> Result<Vec<SearchModel>, String> {
    let url = format!(
        "https://huggingface.co/api/models?search={}&filter=gguf&sort=downloads&direction=-1&limit=20",
        urlencoding::encode(&query)
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "LocalGenie/0.1")
        .send()
        .await
        .map_err(|e| format!("HF API request failed: {e}"))?;

    let models: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse HF API response: {e}"))?;

    let results = models
        .into_iter()
        .filter_map(|m| {
            let id = m["id"].as_str()?.to_string();
            // Only include models that likely have GGUF files
            let siblings = m["siblings"].as_array()?;
            let has_gguf = siblings.iter().any(|s| {
                s["rfilename"]
                    .as_str()
                    .map(|f| f.ends_with(".gguf"))
                    .unwrap_or(false)
            });
            if !has_gguf {
                return None;
            }

            Some(SearchModel {
                name: id.clone(),
                id,
                downloads: m["downloads"].as_u64(),
                likes: m["likes"].as_u64(),
                tags: m["tags"]
                    .as_array()
                    .map(|a| a.iter().filter_map(|t| t.as_str().map(String::from)).collect()),
                pipeline_tag: m["pipeline_tag"].as_str().map(String::from),
            })
        })
        .collect();

    Ok(results)
}
