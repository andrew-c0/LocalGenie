//! HTTP transport for probes: request bodies, sending, reading streamed replies, and reply classification.

use super::*;

/// Error text that names the value itself, so a refusal with a 5xx status still counts as rejected.
pub(super) const VALUE_ERROR_PATTERNS: [&str; 8] = [
    "invalid",
    "unsupported",
    "not supported",
    "unknown parameter",
    "unknown field",
    "unrecognized",
    "out of range",
    "must be",
];

/// What one request came back with.
#[derive(Debug)]
pub(super) enum Reply {
    Ok(Value),
    Rejected(String),
    Inconclusive(String),
}

/// The outcome for one key.
#[derive(Debug)]
pub(super) enum Verdict {
    Status(CapabilityStatus, String),
    /// The chat template or the file summary shows no sign of the feature, so no probe ran. Stored as
    /// `accepted` with the `template` source.
    Template(String),
    /// Could not tell (timeout, server failure). The key is reported as not run.
    NotRun(String),
    Cancelled,
}

/// Everything a probe needs to reach the server.
pub(super) struct Session<'a> {
    pub(super) client: &'a reqwest::Client,
    pub(super) url: String,
    pub(super) model: String,
    /// Always `probe_recipe()`.
    pub(super) load: ModelLoadParams,
    pub(super) hints: TemplateHints,
    pub(super) cancel: &'a AtomicBool,
}

/// Request body for a probe. `fields` replace the base values.
pub(super) fn request_body(
    model: &str,
    load: &ModelLoadParams,
    temperature: f64,
    fields: &[(&str, Value)],
) -> Value {
    let mut body = json!({
        "model": model,
        "messages": [{ "role": "user", "content": PROMPT }],
        "stream": false,
        "temperature": temperature,
        "max_tokens": BASE_MAX_TOKENS,
        // Thinking would use the token budget before any reply text, so probes turn it off.
        "enable_think": false,
        "reasoning_format": "none",
    });
    apply_load_params(&mut body, load);
    for (field, value) in fields {
        body[*field] = value.clone();
    }
    body
}

/// Turns a reply into a result. A 200 with a JSON body is a success. A 400 or 422, or an error
/// whose text names the value, rejects the setting. A timeout, a server failure without such text,
/// or any other status is inconclusive. The raw text is kept in the detail.
/// `names` are extra field names: an error whose text names one of them as a whole word is a
/// rejection, as a value error is. Used by the probes whose field has no value-error wording of its
/// own. A name inside a longer word (`toolset`) or identifier (`tools_cache`) does not count.
pub(super) fn classify(status: StatusCode, text: &str, names: &[&str]) -> Reply {
    if status.is_success() {
        return match serde_json::from_str::<Value>(text) {
            Ok(value) => Reply::Ok(value),
            Err(e) => Reply::Inconclusive(format!("reply is not JSON: {e}")),
        };
    }
    let detail = if text.trim().is_empty() {
        status.to_string()
    } else {
        format!("{status}: {}", text.trim())
    };
    if matches!(status.as_u16(), 408 | 429) {
        return Reply::Inconclusive(detail);
    }
    let lower = text.to_ascii_lowercase();
    let names_value = VALUE_ERROR_PATTERNS.iter().any(|p| lower.contains(p))
        || names.iter().any(|n| names_field(&lower, n));
    if names_value || matches!(status.as_u16(), 400 | 422) {
        Reply::Rejected(detail)
    } else {
        Reply::Inconclusive(detail)
    }
}

/// True when `name` occurs in `lower` as a whole word: the characters on each side are not letters,
/// digits or `_`. `lower` is lowercase, so `name` must be too.
pub(super) fn names_field(lower: &str, name: &str) -> bool {
    fn is_word_char(c: char) -> bool {
        c.is_ascii_alphanumeric() || c == '_'
    }
    lower.match_indices(name).any(|(at, _)| {
        let before = lower[..at].chars().next_back();
        let after = lower[at + name.len()..].chars().next();
        !before.is_some_and(is_word_char) && !after.is_some_and(is_word_char)
    })
}

/// Sends one request. `None` when the scan was cancelled while it waited. A body with `stream`
/// true is read as a server-sent event stream, and the connection is dropped once the reply has
/// what the probe needs (see `read_stream`).
///
/// Timeouts: a plain request has a whole-request timeout of `CAPABILITY_PROBE_TIMEOUT_SECS`. A
/// streamed request has none, because a long thinking reply can run well past that. Instead the
/// response headers must arrive within that time, and each chunk after them must arrive within it
/// too (see `read_stream`). The shared client's connect timeout applies to both.
pub(super) async fn send_once(
    session: &Session<'_>,
    body: &Value,
    names: &[&str],
) -> Option<Reply> {
    let wait = Duration::from_secs(CAPABILITY_PROBE_TIMEOUT_SECS);
    let streaming = body["stream"].as_bool() == Some(true);
    let builder = session.client.post(&session.url).json(body);
    let response = if streaming {
        let sent = tokio::time::timeout(wait, builder.send());
        match unless_cancelled(session.cancel, sent).await? {
            Ok(Ok(response)) => response,
            Ok(Err(e)) => return Some(Reply::Inconclusive(format!("request failed: {e}"))),
            Err(_) => return Some(Reply::Inconclusive(silence_message("no response", wait))),
        }
    } else {
        match unless_cancelled(session.cancel, builder.timeout(wait).send()).await? {
            Ok(response) => response,
            Err(e) => return Some(Reply::Inconclusive(format!("request failed: {e}"))),
        }
    };
    let status = response.status();
    if status.is_success() && streaming {
        return read_stream(session.cancel, response, wait).await;
    }
    let text = match unless_cancelled(session.cancel, response.text()).await? {
        Ok(text) => text,
        Err(e) => return Some(Reply::Inconclusive(format!("reply could not be read: {e}"))),
    };
    Some(classify(status, &text, names))
}

/// Reads a streamed reply until its thinking block closes, then returns. Leaving the function drops
/// the response, which closes the connection; GenieX stops generating when the client disconnects.
/// `None` when the scan was cancelled while it read.
pub(super) async fn read_stream(
    cancel: &AtomicBool,
    response: reqwest::Response,
    chunk_wait: Duration,
) -> Option<Reply> {
    read_chunks(cancel, response.bytes_stream(), chunk_wait).await
}

/// Reads chunks of a stream into a `StreamedReply`, as `read_stream` does. Each chunk must arrive
/// within `chunk_wait`, so a server that goes silent mid-reply is inconclusive rather than waiting
/// forever. The timeout is per chunk, so a slow but steady stream is not cut.
pub(super) async fn read_chunks<S, B, E>(
    cancel: &AtomicBool,
    mut stream: S,
    chunk_wait: Duration,
) -> Option<Reply>
where
    S: futures_util::Stream<Item = Result<B, E>> + Unpin,
    B: AsRef<[u8]>,
    E: std::fmt::Display,
{
    use futures_util::StreamExt;

    let mut streamed = StreamedReply::default();
    loop {
        let next = tokio::time::timeout(chunk_wait, stream.next());
        match unless_cancelled(cancel, next).await? {
            Err(_elapsed) => {
                return Some(Reply::Inconclusive(silence_message("no data", chunk_wait)))
            }
            Ok(None) => break,
            Ok(Some(Ok(bytes))) => {
                if streamed.push(bytes.as_ref()) {
                    break;
                }
            }
            Ok(Some(Err(e))) => return Some(Reply::Inconclusive(format!("stream failed: {e}"))),
        }
    }
    Some(streamed.into_reply())
}

/// Detail for a request that went silent: `what` and the wait, e.g. "no data for 60 s".
pub(super) fn silence_message(what: &str, wait: Duration) -> String {
    format!("{what} for {} s", wait.as_secs_f64())
}

/// What a streamed reply has gathered so far, rebuilt into the shape of a whole reply.
#[derive(Debug, Default)]
pub(super) struct StreamedReply {
    /// Every byte received, kept for a server that answers with one JSON body and no events.
    pub(super) raw: Vec<u8>,
    /// Bytes of the line still being received.
    pub(super) pending: Vec<u8>,
    pub(super) content: String,
    pub(super) reasoning: String,
    pub(super) finish_reason: Option<String>,
    /// Number of `data:` events that parsed as JSON.
    pub(super) events: usize,
    /// Text of an error event from the server, which ends the stream.
    pub(super) error: Option<String>,
}

impl StreamedReply {
    /// Takes the next bytes of the stream. True when the thinking block has closed, so no more
    /// need to be read.
    pub(super) fn push(&mut self, bytes: &[u8]) -> bool {
        self.raw.extend_from_slice(bytes);
        self.pending.extend_from_slice(bytes);
        while let Some(at) = self.pending.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.pending.drain(..=at).collect();
            if self.take_line(&String::from_utf8_lossy(&line)) {
                return true;
            }
        }
        false
    }

    /// Takes one SSE line. True when the thinking block has closed, or the server sent an error.
    pub(super) fn take_line(&mut self, line: &str) -> bool {
        let Some(data) = line.trim().strip_prefix("data:") else {
            return false;
        };
        let Ok(chunk) = serde_json::from_str::<Value>(data.trim()) else {
            return false;
        };
        self.events += 1;
        if let Some(error) = chunk.get("error") {
            self.error = Some(error.to_string());
            return true;
        }
        let choice = &chunk["choices"][0];
        if let Some(text) = choice["delta"]["content"].as_str() {
            self.content.push_str(text);
        }
        if let Some(text) = choice["delta"]["reasoning_content"].as_str() {
            self.reasoning.push_str(text);
        }
        if let Some(reason) = choice["finish_reason"].as_str() {
            self.finish_reason = Some(reason.to_owned());
        }
        thinking_closed(&self.content, &self.reasoning)
    }

    /// The reply in the shape of a whole chat reply, so the same checks read it.
    pub(super) fn into_reply(self) -> Reply {
        if let Some(error) = self.error {
            return Reply::Inconclusive(format!("stream error: {error}"));
        }
        if self.events == 0 {
            return classify(StatusCode::OK, &String::from_utf8_lossy(&self.raw), &[]);
        }
        Reply::Ok(json!({
            "choices": [{
                "finish_reason": self.finish_reason,
                "message": {
                    "content": self.content,
                    "reasoning_content": self.reasoning,
                }
            }]
        }))
    }
}

/// Sends a request, sending it once more when the first is inconclusive. `None` when cancelled.
pub(super) async fn send(session: &Session<'_>, body: &Value, names: &[&str]) -> Option<Reply> {
    let mut last = String::new();
    for _ in 0..ATTEMPTS {
        match send_once(session, body, names).await? {
            Reply::Inconclusive(text) => last = text,
            reply => return Some(reply),
        }
    }
    Some(Reply::Inconclusive(last))
}

/// One probe request. Returns the reply, or the verdict that ends the probe early.
pub(super) async fn ask(
    session: &Session<'_>,
    temperature: f64,
    fields: &[(&str, Value)],
) -> Result<Value, Verdict> {
    ask_naming(session, temperature, fields, &[]).await
}

/// `ask`, where an error that names one of `names` rejects the setting.
pub(super) async fn ask_naming(
    session: &Session<'_>,
    temperature: f64,
    fields: &[(&str, Value)],
    names: &[&str],
) -> Result<Value, Verdict> {
    let body = request_body(&session.model, &session.load, temperature, fields);
    ask_body(session, &body, names).await
}

/// Sends a prepared body and maps the reply to a result, as `ask_naming` does.
pub(super) async fn ask_body(
    session: &Session<'_>,
    body: &Value,
    names: &[&str],
) -> Result<Value, Verdict> {
    match send(session, body, names).await {
        None => Err(Verdict::Cancelled),
        Some(Reply::Ok(value)) => Ok(value),
        Some(Reply::Rejected(text)) => Err(Verdict::Status(CapabilityStatus::Rejected, text)),
        Some(Reply::Inconclusive(text)) => Err(Verdict::NotRun(text)),
    }
}

pub(super) fn finish_reason(reply: &Value) -> Option<&str> {
    reply["choices"][0]["finish_reason"].as_str()
}

pub(super) fn content(reply: &Value) -> Option<&str> {
    reply["choices"][0]["message"]["content"].as_str()
}
