use serde::{Deserialize, Serialize};

/// A single message in the chat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Sampler / generation settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationSettings {
    pub temperature: Option<f64>,
    pub top_p: Option<f64>,
    pub top_k: Option<u32>,
    pub min_p: Option<f64>,
    pub repetition_penalty: Option<f64>,
    pub presence_penalty: Option<f64>,
    pub frequency_penalty: Option<f64>,
    pub max_tokens: Option<u32>,
    pub nctx: Option<u32>,
    pub system_prompt: Option<String>,
    pub think: Option<bool>,
}

/// Strip precision suffix from a model name.
/// e.g. "qualcomm/Qwen3-4B-Instruct-2507:W4A16" -> "qualcomm/Qwen3-4B-Instruct-2507"
pub fn strip_precision(name: &str) -> &str {
    match name.rfind(':') {
        Some(pos) => &name[..pos],
        None => name,
    }
}

/// Resolve the model name to send to the server.
/// The chat server expects "org/repo" WITHOUT precision suffix.
pub fn resolve_model_for_server(model: Option<&str>) -> Option<String> {
    match model {
        Some(m) if !m.is_empty() => {
            let clean = strip_precision(m);
            eprintln!("[chat] model resolved: input={:?} -> clean={}", m, clean);
            Some(clean.to_string())
        }
        _ => {
            eprintln!("[chat] no model provided or empty string");
            None
        }
    }
}

/// Fetch the first loaded model from the server's /v1/models endpoint.
pub async fn fetch_first_loaded_model(client: &reqwest::Client, base_url: &str) -> Option<String> {
    let url = format!("{}/v1/models", base_url);
    let resp = client.get(&url).send().await.ok()?;
    let body: serde_json::Value = resp.json().await.ok()?;

    let model_id = body["data"]
        .as_array()?
        .first()?
        .get("id")?
        .as_str()?
        .to_string();

    eprintln!("[chat] fetched loaded model from server: {}", model_id);
    Some(strip_precision(&model_id).to_string())
}

/// Build the JSON body for a chat completion request.
pub fn build_chat_body(
    messages_json: Vec<serde_json::Value>,
    model_name: Option<String>,
    settings: &GenerationSettings,
) -> serde_json::Value {
    let mut body = serde_json::json!({
        "messages": messages_json,
        "stream": true,
    });

    if let Some(ref m) = model_name {
        body["model"] = serde_json::json!(m);
    }

    if let Some(t) = settings.temperature {
        body["temperature"] = serde_json::json!(t);
    }
    if let Some(tp) = settings.top_p {
        body["top_p"] = serde_json::json!(tp);
    }
    if let Some(tk) = settings.top_k {
        body["top_k"] = serde_json::json!(tk);
    }
    if let Some(mp) = settings.min_p {
        body["min_p"] = serde_json::json!(mp);
    }
    if let Some(rp) = settings.repetition_penalty {
        body["repetition_penalty"] = serde_json::json!(rp);
    }
    if let Some(pp) = settings.presence_penalty {
        body["presence_penalty"] = serde_json::json!(pp);
    }
    if let Some(fp) = settings.frequency_penalty {
        body["frequency_penalty"] = serde_json::json!(fp);
    }
    if let Some(mt) = settings.max_tokens {
        body["max_tokens"] = serde_json::json!(mt);
    }

    body
}
