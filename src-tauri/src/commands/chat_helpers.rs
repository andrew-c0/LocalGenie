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

#[cfg(test)]
mod tests {
    use super::{build_chat_body, strip_precision, GenerationSettings};

    #[test]
    fn strips_precision_suffix() {
        assert_eq!(strip_precision("qualcomm/Qwen3:W4A16"), "qualcomm/Qwen3");
        assert_eq!(strip_precision("qualcomm/Qwen3"), "qualcomm/Qwen3");
    }

    #[test]
    fn chat_body_streams_and_omits_unset_settings() {
        let settings = GenerationSettings {
            temperature: Some(0.5),
            top_p: None,
            top_k: None,
            min_p: None,
            repetition_penalty: None,
            presence_penalty: None,
            frequency_penalty: None,
            max_tokens: None,
            nctx: None,
            system_prompt: None,
            think: None,
        };
        let body = build_chat_body(vec![], Some("m".into()), &settings);
        assert_eq!(body["stream"], true);
        assert_eq!(body["model"], "m");
        assert_eq!(body["temperature"], 0.5);
        assert!(body.get("top_p").is_none());
    }
}
