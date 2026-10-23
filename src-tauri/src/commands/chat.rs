use tauri::{AppHandle, Emitter, State};

use super::chat_helpers::{
    apply_load_params, build_chat_body, chat_done_payload, finish_reason_from_chunk,
    is_first_output, no_output_error, resolve_model_for_server, strip_precision, ChatMessage,
    GenerationSettings, ModelLoadParams,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

/// Cancel flag shared between the cancel command and a streaming loop.
type CancelFlag = Arc<AtomicBool>;

/// Registry entry: stream id → its cancel flag.
type CancelEntry = (String, CancelFlag);

/// Per-request cancel flags. `chat_completion` registers a flag before
/// streaming and removes it when done; `cancel_chat_completion` flips all
/// registered flags, and each streaming loop aborts on the next chunk.
static CANCEL_FLAGS: std::sync::LazyLock<StdMutex<Vec<CancelEntry>>> =
    std::sync::LazyLock::new(|| StdMutex::new(Vec::new()));

fn lock_cancel_flags() -> Result<std::sync::MutexGuard<'static, Vec<CancelEntry>>, String> {
    CANCEL_FLAGS
        .lock()
        .map_err(|_| "chat cancel registry is unavailable".to_string())
}

/// Removes a stream's cancel flag when the stream ends, including on early errors.
struct CancelGuard(String);

impl Drop for CancelGuard {
    fn drop(&mut self) {
        if let Ok(mut flags) = lock_cancel_flags() {
            flags.retain(|(id, _)| *id != self.0);
        }
    }
}

/// Request the in-flight chat completion to stop at the next chunk boundary.
#[tauri::command]
pub async fn cancel_chat_completion() -> Result<(), String> {
    let flags = lock_cancel_flags()?;
    for (_, flag) in flags.iter() {
        flag.store(true, Ordering::SeqCst);
    }
    eprintln!(
        "[chat] cancel requested for {} in-flight stream(s)",
        flags.len()
    );
    Ok(())
}

/// Load a model into the GenieX server by sending a minimal chat request.
/// The server loads models on-demand; this warmup triggers that loading.
/// Returns the refreshed ServerStatus after loading completes.
#[tauri::command]
pub async fn load_model(
    state: State<'_, super::AppState>,
    model: String,
    base_url: Option<String>,
    load: Option<ModelLoadParams>,
) -> Result<super::server::ServerStatus, String> {
    let resolved_base = base_url.unwrap_or_else(|| super::constants::DEFAULT_BASE_URL.into());
    let clean_model = strip_precision(&model);

    eprintln!(
        "[load] loading model '{}' (stripped: '{}')",
        model, clean_model
    );

    // Parse port from the base URL for the returned status
    let port: u16 = resolved_base
        .rsplit(':')
        .next()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(super::constants::DEFAULT_PORT);

    let url = format!("{}/v1/chat/completions", resolved_base);
    let mut body = serde_json::json!({
        "model": clean_model,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
        "stream": false,
    });
    // The warmup must load with the same parameters as chat, or the first message reloads the model.
    apply_load_params(&mut body, &load.unwrap_or_default());

    let response = state
        .http_client
        .post(&url)
        .timeout(std::time::Duration::from_secs(
            super::constants::HTTP_TIMEOUT_SECS,
        ))
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
    let models = super::server::fetch_loaded_models(&state.http_client, &resolved_base).await?;

    // Verify the model actually appears in the loaded list
    let found = models
        .iter()
        .any(|m| m == clean_model || m.starts_with(&format!("{}:", clean_model)));
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
    stream_id: String,
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
        None => super::server::fetch_loaded_models(&state.http_client, &resolved_base)
            .await
            .ok()
            .and_then(|models| models.into_iter().next())
            .map(|id| strip_precision(&id).to_string()),
    };

    if let Some(ref m) = model_name {
        eprintln!("[chat] sending model '{}' to server", m);
    } else {
        eprintln!("[chat] WARNING: no model resolved");
    }

    let body = build_chat_body(messages_json, model_name, &settings);

    // Time-to-first-output limit. It covers the wait for response headers and the
    // wait for the first chunk with content or a finish_reason. Once output has
    // started, the stream runs with no time limit (no per-request `.timeout()`,
    // which would also cut the body).
    let limit_secs = super::constants::HTTP_TIMEOUT_SECS;
    let first_output_by = tokio::time::Instant::now() + std::time::Duration::from_secs(limit_secs);

    let cancel_flag: CancelFlag = Arc::new(AtomicBool::new(false));
    lock_cancel_flags()?.push((stream_id.clone(), Arc::clone(&cancel_flag)));
    // Deregisters on every exit path below, including `?` errors.
    let _cancel_guard = CancelGuard(stream_id.clone());

    let send = state
        .http_client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send();
    let response = match unless_cancelled(&cancel_flag, bounded(send, Some(first_output_by))).await
    {
        None => {
            emit_cancelled(&app, &stream_id);
            return Ok(());
        }
        Some(Err(_elapsed)) => return Err(no_output_error(&url, limit_secs)),
        Some(Ok(sent)) => {
            sent.map_err(|e| format!("Failed to connect to GenieX server at {url}: {e}"))?
        }
    };

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
    // Set from the server's `finish_reason` ("stop", "length", ...) when it arrives.
    let mut finish_reason: Option<String> = None;
    // False until the first content or finish_reason chunk; only then is the limit lifted.
    let mut answered = false;

    loop {
        let deadline = if answered {
            None
        } else {
            Some(first_output_by)
        };
        let next = match unless_cancelled(&cancel_flag, bounded(stream.next(), deadline)).await {
            None => {
                emit_cancelled(&app, &stream_id);
                return Ok(());
            }
            Some(Err(_elapsed)) => return Err(no_output_error(&url, limit_secs)),
            Some(Ok(next)) => next,
        };
        let Some(chunk_result) = next else { break };
        let chunk = chunk_result.map_err(|e| format!("Stream error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete SSE lines
        while let Some(newline_pos) = buffer.find('\n') {
            let line: String = buffer.drain(..=newline_pos).collect();
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if cancel_flag.load(Ordering::SeqCst) {
                emit_cancelled(&app, &stream_id);
                return Ok(());
            }

            if let Some(data) = trimmed.strip_prefix("data:") {
                let data = data.trim();
                if data == "[DONE]" {
                    eprintln!("[chat] stream complete: {chunk_count} chunks");
                    let _ = app.emit(
                        "chat-done",
                        chat_done_payload(&stream_id, finish_reason.as_deref()),
                    );
                    return Ok(());
                }

                // Parse the SSE JSON chunk
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if is_first_output(&parsed) {
                        answered = true;
                    }
                    if let Some(reason) = finish_reason_from_chunk(&parsed) {
                        finish_reason = Some(reason);
                    }
                    if let Some(choices) = parsed["choices"].as_array() {
                        for choice in choices {
                            if let Some(delta) = choice.get("delta") {
                                if let Some(content) = delta["content"].as_str() {
                                    if !content.is_empty() {
                                        chunk_count += 1;
                                        let _ = app.emit(
                                            "chat-chunk",
                                            serde_json::json!({
                                                "streamId": stream_id,
                                                "content": content,
                                            }),
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Cancel checked between network chunks too — a user stop should not
        // wait for more tokens to arrive over the wire.
        if cancel_flag.load(Ordering::SeqCst) {
            emit_cancelled(&app, &stream_id);
            return Ok(());
        }
    }

    // Stream ended without `[DONE]`; report whatever finish reason was seen.
    let _ = app.emit(
        "chat-done",
        chat_done_payload(&stream_id, finish_reason.as_deref()),
    );

    Ok(())
}

/// Tell the frontend a stream was stopped by the user.
fn emit_cancelled(app: &AppHandle, stream_id: &str) {
    eprintln!("[chat] stream {stream_id} cancelled by user");
    let _ = app.emit("chat-done", chat_done_payload(stream_id, Some("cancelled")));
}

/// How often a waiting request re-checks its cancel flag.
const CANCEL_POLL: std::time::Duration = std::time::Duration::from_millis(100);

/// Await `fut`, failing with `Elapsed` if `deadline` passes first. `None` means no limit.
async fn bounded<F: std::future::Future>(
    fut: F,
    deadline: Option<tokio::time::Instant>,
) -> Result<F::Output, tokio::time::error::Elapsed> {
    match deadline {
        Some(at) => tokio::time::timeout_at(at, fut).await,
        None => Ok(fut.await),
    }
}

/// Await `fut`, returning `None` as soon as the cancel flag is set.
pub(super) async fn unless_cancelled<F: std::future::Future>(
    cancel: &AtomicBool,
    fut: F,
) -> Option<F::Output> {
    tokio::pin!(fut);
    loop {
        tokio::select! {
            out = &mut fut => return Some(out),
            _ = tokio::time::sleep(CANCEL_POLL) => {
                if cancel.load(Ordering::SeqCst) {
                    return None;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{bounded, unless_cancelled};
    use std::sync::atomic::AtomicBool;

    #[tokio::test]
    async fn deadline_in_the_past_elapses_a_pending_wait() {
        let result = bounded(
            std::future::pending::<()>(),
            Some(tokio::time::Instant::now()),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn no_deadline_waits_for_the_value() {
        assert_eq!(bounded(async { 7 }, None).await.ok(), Some(7));
    }

    #[tokio::test]
    async fn cancel_flag_interrupts_a_pending_wait() {
        let flag = AtomicBool::new(true);
        let out = unless_cancelled(&flag, std::future::pending::<()>()).await;
        assert!(out.is_none());
    }

    #[tokio::test]
    async fn completed_wait_is_returned_when_not_cancelled() {
        let flag = AtomicBool::new(false);
        assert_eq!(unless_cancelled(&flag, async { 3 }).await, Some(3));
    }
}
