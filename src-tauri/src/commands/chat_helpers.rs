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
    pub seed: Option<i64>,
    pub think: Option<bool>,
    /// GBNF grammar for constrained output. Sent inline; the server takes no file path.
    pub grammar_string: Option<String>,
    pub system_prompt: Option<String>,
    /// Model load parameters, sent with every request. The server reloads the model when they change.
    #[serde(flatten)]
    pub load: ModelLoadParams,
}

/// Load-time parameters the server keys its model cache on. Sent with the warmup and with
/// each chat request, so a model is loaded with the same parameters it is used with.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelLoadParams {
    pub nctx: Option<i32>,
    pub ngl: Option<i32>,
    /// `cpu`, `gpu`, `npu`, `hybrid`, or an explicit device list.
    pub compute: Option<String>,
    /// HTP power mode, for example `burst`.
    pub power_mode: Option<String>,
    /// Speculative decoding type, llama.cpp only. Empty or None disables it.
    pub spec_type: Option<String>,
    pub spec_draft_model: Option<String>,
    pub spec_n_max: Option<i32>,
    pub spec_n_min: Option<i32>,
    pub spec_p_min: Option<f32>,
}

/// Write the load parameters that are set into a request body, using the server's field names.
/// Empty strings are skipped so the server default applies.
pub fn apply_load_params(body: &mut serde_json::Value, load: &ModelLoadParams) {
    if let Some(n) = load.nctx {
        body["nctx"] = serde_json::json!(n);
    }
    if let Some(n) = load.ngl {
        body["ngl"] = serde_json::json!(n);
    }
    if let Some(ref c) = load.compute.as_deref().filter(|s| !s.is_empty()) {
        body["compute"] = serde_json::json!(c);
    }
    if let Some(ref p) = load.power_mode.as_deref().filter(|s| !s.is_empty()) {
        body["power_mode"] = serde_json::json!(p);
    }
    if let Some(ref t) = load.spec_type.as_deref().filter(|s| !s.is_empty()) {
        body["spec_type"] = serde_json::json!(t);
    }
    if let Some(ref m) = load.spec_draft_model.as_deref().filter(|s| !s.is_empty()) {
        body["spec_draft_model"] = serde_json::json!(m);
    }
    if let Some(n) = load.spec_n_max {
        body["spec_n_max"] = serde_json::json!(n);
    }
    if let Some(n) = load.spec_n_min {
        body["spec_n_min"] = serde_json::json!(n);
    }
    if let Some(p) = load.spec_p_min {
        body["spec_p_min"] = serde_json::json!(p);
    }
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
    if let Some(seed) = settings.seed {
        body["seed"] = serde_json::json!(seed);
    }
    if let Some(think) = settings.think {
        body["enable_think"] = serde_json::json!(think);
    }
    // Keep thinking inline in `content`: the UI splits `<think>` blocks out of the text, and the
    // server's default ("deepseek") would move them into `reasoning_content`, which the UI does not read.
    body["reasoning_format"] = serde_json::json!("none");

    apply_load_params(&mut body, &settings.load);
    if let Some(ref grammar) = settings.grammar_string.as_deref().filter(|s| !s.is_empty()) {
        body["grammar_string"] = serde_json::json!(grammar);
    }

    body
}

/// Return the `finish_reason` of a streamed SSE chunk, if the server set one.
/// Intermediate chunks carry `null` or omit the field, which yields `None`.
pub fn finish_reason_from_chunk(parsed: &serde_json::Value) -> Option<String> {
    parsed["choices"]
        .as_array()?
        .iter()
        .find_map(|choice| choice["finish_reason"].as_str())
        .map(str::to_string)
}

/// Payload for the `chat-done` event. `finish_reason` is the server's value,
/// or `"cancelled"` when the user stopped the stream; `None` serializes as null.
pub fn chat_done_payload(stream_id: &str, finish_reason: Option<&str>) -> serde_json::Value {
    serde_json::json!({ "streamId": stream_id, "finishReason": finish_reason })
}

/// True when a streamed SSE chunk is the first real output: it carries non-empty
/// `content` or a `finish_reason`. Role-only and empty chunks do not count.
pub fn is_first_output(parsed: &serde_json::Value) -> bool {
    parsed["choices"].as_array().is_some_and(|choices| {
        choices.iter().any(|choice| {
            choice["delta"]["content"]
                .as_str()
                .is_some_and(|content| !content.is_empty())
                || choice["finish_reason"].is_string()
        })
    })
}

/// Error shown when no output started within the first-output limit.
pub fn no_output_error(url: &str, limit_secs: u64) -> String {
    format!("No response started within {limit_secs} s from GenieX server at {url}")
}

#[cfg(test)]
mod tests {
    use super::{
        build_chat_body, chat_done_payload, finish_reason_from_chunk, is_first_output,
        no_output_error, strip_precision, GenerationSettings, ModelLoadParams,
    };

    #[test]
    fn first_output_is_content_or_finish_reason() {
        let content = serde_json::json!({"choices": [{"delta": {"content": "hi"}}]});
        assert!(is_first_output(&content));

        let finish = serde_json::json!({"choices": [{"delta": {}, "finish_reason": "stop"}]});
        assert!(is_first_output(&finish));

        let role_only = serde_json::json!({"choices": [{"delta": {"role": "assistant"}}]});
        assert!(!is_first_output(&role_only));

        let empty =
            serde_json::json!({"choices": [{"delta": {"content": ""}, "finish_reason": null}]});
        assert!(!is_first_output(&empty));

        let no_choices = serde_json::json!({"usage": {}});
        assert!(!is_first_output(&no_choices));
    }

    #[test]
    fn no_output_error_names_the_limit() {
        let msg = no_output_error("http://127.0.0.1:18181/v1/chat/completions", 300);
        assert!(msg.starts_with("No response started within 300 s"));
    }

    #[test]
    fn reads_finish_reason_only_when_set() {
        let last = serde_json::json!({"choices": [{"delta": {}, "finish_reason": "length"}]});
        assert_eq!(finish_reason_from_chunk(&last).as_deref(), Some("length"));

        let middle =
            serde_json::json!({"choices": [{"delta": {"content": "hi"}, "finish_reason": null}]});
        assert_eq!(finish_reason_from_chunk(&middle), None);

        let missing = serde_json::json!({"choices": [{"delta": {"content": "hi"}}]});
        assert_eq!(finish_reason_from_chunk(&missing), None);
    }

    #[test]
    fn done_payload_uses_camel_case_and_null_when_unset() {
        let cancelled = chat_done_payload("s1", Some("cancelled"));
        assert_eq!(cancelled["streamId"], "s1");
        assert_eq!(cancelled["finishReason"], "cancelled");

        let unset = chat_done_payload("s1", None);
        assert!(unset["finishReason"].is_null());
    }

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
            seed: None,
            think: None,
            grammar_string: None,
            system_prompt: None,
            load: ModelLoadParams::default(),
        };
        let body = build_chat_body(vec![], Some("m".into()), &settings);
        assert_eq!(body["stream"], true);
        assert_eq!(body["model"], "m");
        assert_eq!(body["temperature"], 0.5);
        assert!(body.get("top_p").is_none());
        assert!(body.get("seed").is_none());
        assert!(body.get("enable_think").is_none());
        assert_eq!(body["reasoning_format"], "none");
    }

    #[test]
    fn chat_body_sends_seed_penalties_and_think() {
        let settings = GenerationSettings {
            temperature: None,
            top_p: None,
            top_k: None,
            min_p: None,
            repetition_penalty: None,
            presence_penalty: Some(0.2),
            frequency_penalty: Some(0.3),
            max_tokens: None,
            seed: Some(42),
            think: Some(false),
            grammar_string: None,
            system_prompt: None,
            load: ModelLoadParams::default(),
        };
        let body = build_chat_body(vec![], None, &settings);
        assert_eq!(body["seed"], 42);
        assert_eq!(body["enable_think"], false);
        assert_eq!(body["presence_penalty"], 0.2);
        assert_eq!(body["frequency_penalty"], 0.3);
        assert!(body.get("stop").is_none());
    }

    #[test]
    fn chat_body_sends_load_params_speculation_and_grammar() {
        let settings = GenerationSettings {
            temperature: None,
            top_p: None,
            top_k: None,
            min_p: None,
            repetition_penalty: None,
            presence_penalty: None,
            frequency_penalty: None,
            max_tokens: None,
            seed: None,
            think: None,
            grammar_string: Some("root ::= \"yes\"".into()),
            system_prompt: None,
            load: ModelLoadParams {
                nctx: Some(8192),
                ngl: Some(-1),
                compute: Some("npu".into()),
                power_mode: Some(String::new()),
                spec_type: Some("draft-mtp".into()),
                spec_draft_model: Some("org/draft:Q4_0".into()),
                spec_n_max: Some(3),
                spec_n_min: None,
                spec_p_min: Some(0.5),
            },
        };
        let body = build_chat_body(vec![], None, &settings);
        assert_eq!(body["nctx"], 8192);
        assert_eq!(body["ngl"], -1);
        assert_eq!(body["compute"], "npu");
        assert!(body.get("power_mode").is_none(), "empty power mode is omitted");
        assert_eq!(body["spec_type"], "draft-mtp");
        assert_eq!(body["spec_draft_model"], "org/draft:Q4_0");
        assert_eq!(body["spec_n_max"], 3);
        assert!(body.get("spec_n_min").is_none());
        assert_eq!(body["spec_p_min"], 0.5);
        assert_eq!(body["grammar_string"], "root ::= \"yes\"");
    }

    #[test]
    fn settings_deserialize_load_params_from_camel_case() {
        let raw = serde_json::json!({
            "temperature": 0.4,
            "nctx": 2048,
            "powerMode": "burst",
            "specType": "ngram-simple",
            "specNMax": 5,
            "grammarString": "root ::= \"ok\""
        });
        let settings: GenerationSettings = serde_json::from_value(raw).expect("settings parse");
        assert_eq!(settings.load.nctx, Some(2048));
        assert_eq!(settings.load.power_mode.as_deref(), Some("burst"));
        assert_eq!(settings.load.spec_type.as_deref(), Some("ngram-simple"));
        assert_eq!(settings.load.spec_n_max, Some(5));
        assert_eq!(settings.grammar_string.as_deref(), Some("root ::= \"ok\""));
    }
}
