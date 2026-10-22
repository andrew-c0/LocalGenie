use serde::{Deserialize, Serialize};
use tauri::State;

use super::AppState;

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

/// Search Hugging Face for GGUF models.
/// Uses the HF API directly (no CLI dependency).
#[tauri::command]
pub async fn search_models(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchModel>, String> {
    let url = format!(
        "https://huggingface.co/api/models?search={}&filter=gguf&sort=downloads&direction=-1&limit=20",
        urlencoding::encode(&query)
    );

    let resp = state
        .http_client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HF API request failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HF API returned HTTP {}", resp.status()));
    }

    let models: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse HF API response: {e}"))?;

    Ok(models
        .into_iter()
        .filter_map(|m| {
            let id = m["id"].as_str()?.to_string();
            // Only include models that likely have GGUF files
            let has_gguf = m["siblings"].as_array()?.iter().any(|s| {
                s["rfilename"]
                    .as_str()
                    .is_some_and(|f| f.ends_with(".gguf"))
            });
            if !has_gguf {
                return None;
            }

            Some(SearchModel {
                name: id.clone(),
                id,
                downloads: m["downloads"].as_u64(),
                likes: m["likes"].as_u64(),
                tags: m["tags"].as_array().map(|a| {
                    a.iter()
                        .filter_map(|t| t.as_str().map(String::from))
                        .collect()
                }),
                pipeline_tag: m["pipeline_tag"].as_str().map(String::from),
            })
        })
        .collect())
}
