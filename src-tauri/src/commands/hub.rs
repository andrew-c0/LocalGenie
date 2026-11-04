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
    let resp = state
        .http_client
        .get(search_url(&query))
        .timeout(std::time::Duration::from_secs(
            super::constants::HTTP_TIMEOUT_SECS,
        ))
        .send()
        .await
        .map_err(|e| format!("Failed to reach the Hugging Face API: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HF API returned HTTP {}", resp.status()));
    }

    let models: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse HF API response: {e}"))?;

    Ok(gguf_models(&models))
}

/// Search URL for GGUF models by downloads. `expand[]=siblings` is required: without it the API
/// omits each model's file list, and `gguf_models` would drop every result.
fn search_url(query: &str) -> String {
    format!(
        "https://huggingface.co/api/models?search={}&filter=gguf&sort=downloads&direction=-1&limit=20&expand[]=siblings",
        urlencoding::encode(query)
    )
}

/// Models from a search response that list a `.gguf` file among their siblings. A model without
/// a file list is left out, since its GGUF files cannot be seen.
fn gguf_models(models: &[serde_json::Value]) -> Vec<SearchModel> {
    models
        .iter()
        .filter_map(|m| {
            let id = m["id"].as_str()?.to_string();
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
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn search_url_asks_for_the_file_list_and_encodes_the_query() {
        let url = search_url("qwen 3");
        assert!(url.starts_with("https://huggingface.co/api/models?search=qwen%203&filter=gguf"));
        assert!(url.ends_with("&expand[]=siblings"));
    }

    #[test]
    fn gguf_models_keeps_only_models_with_a_gguf_file() {
        let models = vec![
            json!({
                "id": "unsloth/Qwen3-GGUF",
                "downloads": 10,
                "likes": 2,
                "tags": ["gguf", "qwen3"],
                "siblings": [{"rfilename": "README.md"}, {"rfilename": "Qwen3-Q4_K_M.gguf"}]
            }),
            // No GGUF file among the siblings.
            json!({"id": "org/safetensors-only", "siblings": [{"rfilename": "model.safetensors"}]}),
            // No file list at all (the search was made without `expand[]=siblings`).
            json!({"id": "org/no-file-list", "downloads": 5}),
        ];
        let found = gguf_models(&models);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].id, "unsloth/Qwen3-GGUF");
        assert_eq!(found[0].name, "unsloth/Qwen3-GGUF");
        assert_eq!(found[0].downloads, Some(10));
        assert_eq!(found[0].tags, Some(vec!["gguf".into(), "qwen3".into()]));
    }
}
