use tauri::{AppHandle, Emitter, State};

use super::chat_helpers::{
    build_chat_body, fetch_first_loaded_model, resolve_model_for_server, strip_precision,
    ChatMessage, GenerationSettings,
};

/// Load a model into the GenieX server by sending a minimal chat request.
/// The server loads models on-demand; this warmup triggers that loading.
/// Returns the refreshed ServerStatus after loading completes.
#[tauri::command]
pub async fn load_model(
    state: State<'_, super::AppState>,
    model: String,
    base_url: Option<String>,
) -> Result<super::server::ServerStatus, String> {
    let resolved_base = base_url.unwrap_or_else(|| super::constants::DEFAULT_BASE_URL.into());
    let clean_model = strip_precision(&model);

    eprintln!("[load] loading model '{}' (stripped: '{}')", model, clean_model);

    // Parse port from the base URL for the returned status
    let port: u16 = resolved_base
        .rsplit(':')
        .next()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(super::constants::DEFAULT_PORT);

    let url = format!("{}/v1/chat/completions", resolved_base);
    let body = serde_json::json!({
        "model": clean_model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
        "stream": false,
    });

    let response = state
        .http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to server at {url}: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        eprintln!("[load] server error: {} {}", status, text);
        return Err(format!("Server returned {status}: {text}"));
    }

    eprintln!("[load] model '{}' loaded successfully", clean_model);

    // Refresh server status to reflect newly loaded models
    let models =
        super::server::fetch_loaded_models(&state.http_client, &resolved_base).await?;

    // Verify the model actually appears in the loaded list
    let found = models.iter().any(|m| {
        m == clean_model || m.starts_with(&format!("{}:", clean_model))
    });
    if !found {
        return Err(format!(
            "Model '{}' does not appear loaded on the server. Loaded models: {:?}",
            clean_model, models
        ));
    }

    Ok(super::server::ServerStatus {
        running: true,
        port,
        models,
    })
}

/// Unload all models by stopping the GenieX server.
/// The server has no per-model unload endpoint, so this is the only option.
#[tauri::command]
pub async fn unload_all_models(
    state: tauri::State<'_, super::AppState>,
    port: Option<u16>,
) -> Result<super::server::ServerStatus, String> {
    eprintln!("[unload] stopping server to unload all models");
    super::server::stop_server(state, port).await
}

/// Stream a chat completion from the GenieX OpenAI-compatible API.
/// Emits `chat-chunk` events for each streamed token, and `chat-done` when finished.
#[tauri::command]
pub async fn chat_completion(
    app: AppHandle,
    state: State<'_, super::AppState>,
    messages: Vec<ChatMessage>,
    settings: GenerationSettings,
    model: Option<String>,
    base_url: Option<String>,
) -> Result<(), String> {
    let resolved_base = base_url.unwrap_or_else(|| super::constants::DEFAULT_BASE_URL.into());
    let url = format!("{}/v1/chat/completions", resolved_base);

    eprintln!(
        "[chat] called: model={:?}, messages={}, url={}",
        model,
        messages.len(),
        url
    );

    let mut messages_json: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": m.content
            })
        })
        .collect();

    // Prepend system prompt if provided
    if let Some(sp) = &settings.system_prompt {
        if !sp.is_empty() {
            messages_json.insert(
                0,
                serde_json::json!({
                    "role": "system",
                    "content": sp
                }),
            );
        }
    }

    // Resolve model name — strip precision if present, or auto-detect from server
    let model_name = match resolve_model_for_server(model.as_deref()) {
        Some(name) => Some(name),
        None => fetch_first_loaded_model(&state.http_client, &resolved_base).await,
    };

    if let Some(ref m) = model_name {
        eprintln!("[chat] sending model '{}' to server", m);
    } else {
        eprintln!("[chat] WARNING: no model resolved");
    }

    let body = build_chat_body(messages_json, model_name, &settings);

    let response = state
        .http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to GenieX server at {url}: {e}"))?;

    let status = response.status();
    eprintln!("[chat] server response status: {}", status);

    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        eprintln!("[chat] server error: {} {}", status, text);
        return Err(format!("Server returned {status}: {text}"));
    }

    // Stream the SSE response
    use futures_util::StreamExt;

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut chunk_count: u32 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error: {e}"))?;
        let text = String::from_utf8_lossy(&chunk);
        buffer.push_str(&text);

        // Process complete SSE lines
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Some(data) = trimmed.strip_prefix("data:") {
                let data = data.trim();
                if data == "[DONE]" {
                    eprintln!("[chat] stream complete: {chunk_count} chunks");
                    let _ = app.emit("chat-done", ());
                    return Ok(());
                }

                // Parse the SSE JSON chunk
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(choices) = parsed["choices"].as_array() {
                        for choice in choices {
                            if let Some(delta) = choice.get("delta") {
                                if let Some(content) = delta["content"].as_str() {
                                    if !content.is_empty() {
                                        chunk_count += 1;
                                        let _ = app.emit("chat-chunk", serde_json::json!({
                                            "content": content,
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // If we get here without [DONE], still emit done
    eprintln!("[chat] stream ended without [DONE]: {chunk_count} chunks");
    let _ = app.emit("chat-done", ());

    Ok(())
}
