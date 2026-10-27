//! Settings scan: probes each sampling setting against the running GenieX server and records the
//! result per model (see `model_capabilities.rs`).
//!
//! Probes never read or write the user's saved settings. Each request is built here, with a short
//! prompt, temperature 0 and a small `max_tokens`. Every probe sends the fixed load recipe
//! (`probe_recipe`), so the server keeps the model it has loaded and the result does not depend on
//! the saved settings.
//!
//! The chat template's hints and the file summary (`capabilities::summary_for`) decide which probes
//! run. A saved chat reply that shows a think block is also recorded as evidence (`note_saved_reply`).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::StatusCode;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use super::chat_helpers::with_think_token;

use super::capabilities::{self, model_folder, scan_folder};
use super::chat::unless_cancelled;
use super::chat_helpers::{apply_load_params, strip_precision, ModelLoadParams};
use super::cli::get_installed_version_timeout;
use super::constants::{CAPABILITY_PROBE_TIMEOUT_SECS, CLI_PROBE_TIMEOUT_SECS, DEFAULT_BASE_URL};
use super::logs;
use super::server::fetch_loaded_models;
use super::AppState;
use crate::model_capabilities::{
    self, CapabilityEntry, CapabilityKey, CapabilityRecord, CapabilitySource, CapabilityStatus,
    Fingerprint,
};

/// Prompt for every probe except the thinking and grammar probes. Long enough to run past a small
/// `max_tokens`.
const PROMPT: &str = "Count from one to twenty, separated by spaces.";

/// Prompt for the thinking probe. Counting does not make Gemma 4 think, so this one asks a question
/// that needs reasoning. Both thinking requests send it, so only the switch differs.
const THINKING_PROMPT: &str = "Is 221 a prime number? Explain briefly.";

/// `max_tokens` for every probe that does not test it.
const BASE_MAX_TOKENS: u64 = 32;

/// `max_tokens` for the thinking-off request of the thinking probe. Enough for a short reply.
const THINK_MAX_TOKENS: u64 = 200;

/// Hard cap for the thinking-on request. The stream is dropped as soon as the think block closes,
/// so the cap only matters for a model that never closes it.
const THINK_STREAM_MAX_TOKENS: u64 = 1024;

/// `max_tokens` for the tool-call probe. A tool call is short, so this is ample.
const TOOL_MAX_TOKENS: u64 = 100;

/// Prompt for the tool-call probe. It only makes sense with the `get_weather` tool offered.
const TOOL_PROMPT: &str = "What is the weather in Paris? Use the tool.";

/// Grammar for the grammar probe: the reply may only be `yes` or `no`.
const GRAMMAR_YES_NO: &str = "root ::= \"yes\" | \"no\"";

/// Prompt for the grammar probe. Its answer is one of the two words the grammar allows.
const GRAMMAR_PROMPT: &str = "Is the sky blue? Answer yes or no.";

/// `max_tokens` for the grammar probe. Both allowed words are shorter than this.
const GRAMMAR_MAX_TOKENS: u64 = 8;

/// 96x96 solid red PNG, sent by the vision probe. Bundled, so the probe never reads the disk.
const RED_PNG: &[u8] = include_bytes!("../../probe-assets/red-96.png");

/// Spoken "one, two, three": 22050 Hz mono 16-bit WAV, sent by the audio probe. Bundled as above.
const ONE_TWO_THREE_WAV: &[u8] = include_bytes!("../../probe-assets/one-two-three.wav");

/// Prompt for the vision probe, sent with `RED_PNG`.
const VISION_PROMPT: &str = "What colour is this image? Answer with one word.";

/// `max_tokens` for the vision probe. A one-word answer is short.
const VISION_MAX_TOKENS: u64 = 16;

/// Prompt for the audio probe, sent with `ONE_TWO_THREE_WAV`.
const AUDIO_PROMPT: &str = "What number words do you hear? Answer briefly.";

/// `max_tokens` for the audio probe. A short list of number words is ample.
const AUDIO_MAX_TOKENS: u64 = 16;

/// Requests per probe. An inconclusive request is sent again once.
const ATTEMPTS: u32 = 2;

/// Event sent before each setting is probed.
const PROGRESS_EVENT: &str = "capability-scan-progress";

/// Context window for every probe. It is GenieX's default (`--nctx`, 4096), and it leaves room for a
/// 1024-token thinking reply plus the prompt.
const RECIPE_NCTX: i32 = 4096;

/// The load parameters every probe sends, and no others: the server uses its own defaults for the
/// rest. The probes never use the saved settings, so a result does not depend on how the user set
/// the model up. The server reloads a model when its load parameters change, so a model loaded with
/// another context window is reloaded by the scan.
fn probe_recipe() -> ModelLoadParams {
    ModelLoadParams {
        nctx: Some(RECIPE_NCTX),
        ..Default::default()
    }
}

/// Error text that names the value itself, so a refusal with a 5xx status still counts as rejected.
const VALUE_ERROR_PATTERNS: [&str; 8] = [
    "invalid",
    "unsupported",
    "not supported",
    "unknown parameter",
    "unknown field",
    "unrecognized",
    "out of range",
    "must be",
];

/// Set by `cancel_capability_scan`, checked between settings and while a request is in flight.
static SCAN_CANCEL: AtomicBool = AtomicBool::new(false);

/// True while a scan runs. Only one scan may run at a time.
static SCAN_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Holds the scan slot. Released when the scan ends, however it ends.
struct ScanGuard;

impl ScanGuard {
    fn begin() -> Result<Self, String> {
        SCAN_ACTIVE
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "A settings scan is already running.".to_owned())?;
        SCAN_CANCEL.store(false, Ordering::SeqCst);
        Ok(ScanGuard)
    }
}

impl Drop for ScanGuard {
    fn drop(&mut self) {
        SCAN_ACTIVE.store(false, Ordering::SeqCst);
    }
}

/// How a probe's effect is checked, beyond the server answering 200.
#[derive(Debug, Clone, Copy)]
enum Check {
    /// HTTP 200 is all that can be seen, so the result is `accepted`.
    AcceptedOnly,
    /// With `max_tokens` 4 the reply must stop on the length limit.
    OutputCut,
    /// Two runs with the same seed at temperature 1 must give the same reply.
    SameSeed,
    /// Two replies, thinking on and off: only the first may show a think block.
    Thinking,
    /// The reply must carry a tool call for the offered `get_weather` function.
    ToolCalls,
    /// The reply, constrained by the grammar, must be exactly `yes` or `no`.
    Grammar,
    /// The reply must name the colour red for the bundled image.
    Vision,
    /// The reply must name the number three for the bundled WAV.
    Audio,
}

/// The one function offered by the tool-call probe.
fn weather_tool() -> Value {
    json!([{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather for a city.",
            "parameters": {
                "type": "object",
                "properties": { "city": { "type": "string" } },
                "required": ["city"]
            }
        }
    }])
}

/// The image as a data URL, the form the `image_url` content part takes.
fn red_image_url() -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(RED_PNG))
}

/// The WAV as base64, the `data` of an `input_audio` content part.
fn one_two_three_base64() -> String {
    STANDARD.encode(ONE_TWO_THREE_WAV)
}

/// The field under test for a key: the server's field name, a non-default value, and its check.
/// For `Thinking` the field is `enable_think` set on; the probe also sends it off. For `ToolCalls`
/// and `GrammarString` the value is the tool list and the grammar text. For `Vision` and `Audio` the
/// value is the image data URL and the WAV's base64, which go into the message content parts.
fn probe_for(key: CapabilityKey) -> (&'static str, Value, Check) {
    match key {
        CapabilityKey::Temperature => ("temperature", json!(0.5), Check::AcceptedOnly),
        CapabilityKey::TopP => ("top_p", json!(0.5), Check::AcceptedOnly),
        CapabilityKey::TopK => ("top_k", json!(5), Check::AcceptedOnly),
        CapabilityKey::MinP => ("min_p", json!(0.2), Check::AcceptedOnly),
        CapabilityKey::RepetitionPenalty => ("repetition_penalty", json!(1.3), Check::AcceptedOnly),
        CapabilityKey::PresencePenalty => ("presence_penalty", json!(0.5), Check::AcceptedOnly),
        CapabilityKey::FrequencyPenalty => ("frequency_penalty", json!(0.5), Check::AcceptedOnly),
        CapabilityKey::MaxTokens => ("max_tokens", json!(4), Check::OutputCut),
        CapabilityKey::Seed => ("seed", json!(42), Check::SameSeed),
        CapabilityKey::Thinking => ("enable_think", json!(true), Check::Thinking),
        CapabilityKey::ToolCalls => ("tools", weather_tool(), Check::ToolCalls),
        CapabilityKey::GrammarString => ("grammar_string", json!(GRAMMAR_YES_NO), Check::Grammar),
        CapabilityKey::Vision => ("image_url", json!(red_image_url()), Check::Vision),
        CapabilityKey::Audio => ("input_audio", json!(one_two_three_base64()), Check::Audio),
    }
}

/// What one request came back with.
#[derive(Debug)]
enum Reply {
    Ok(Value),
    Rejected(String),
    Inconclusive(String),
}

/// The outcome for one key.
#[derive(Debug)]
enum Verdict {
    Status(CapabilityStatus, String),
    /// The chat template or the file summary shows no sign of the feature, so no probe ran. Stored as
    /// `accepted` with the `template` source.
    Template(String),
    /// Could not tell (timeout, server failure). The key is reported as not run.
    NotRun(String),
    Cancelled,
}

/// The hints from the capability summary. `None` is unknown (the summary could not be read).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct TemplateHints {
    /// From the chat template.
    thinking: Option<bool>,
    /// From the chat template.
    tool_calls: Option<bool>,
    /// `hasVisionProjector` from the summary. Unknown runs the probe.
    vision: Option<bool>,
    /// `hasAudioEncoder` from the summary. Only `Some(true)` runs the probe.
    audio: Option<bool>,
}

/// Why a probe is skipped, from the hints. `None` runs the probe.
///
/// - Thinking and tool calls: a chat template with hint `false` shows no sign of the feature. An
///   unknown hint runs the probe.
/// - Vision: the summary has no vision projector. An unknown summary runs the probe.
/// - Audio: the summary does not say the audio encoder is there. Anything but `true` skips it.
fn template_skip(key: CapabilityKey, hints: TemplateHints) -> Option<String> {
    let (hint, feature) = match key {
        CapabilityKey::Thinking => (hints.thinking, "thinking"),
        CapabilityKey::ToolCalls => (hints.tool_calls, "tool calls"),
        CapabilityKey::Vision => {
            return (hints.vision == Some(false)).then(|| {
                "No vision projector in the model folder, so the probe was not run.".to_owned()
            })
        }
        CapabilityKey::Audio => {
            return (hints.audio != Some(true)).then(|| {
                "No audio encoder in the model file, so the probe was not run.".to_owned()
            })
        }
        _ => return None,
    };
    (hint == Some(false))
        .then(|| format!("The chat template shows no sign of {feature}, so the probe was not run."))
}

/// Everything a probe needs to reach the server.
struct Session<'a> {
    client: &'a reqwest::Client,
    url: String,
    model: String,
    /// Always `probe_recipe()`.
    load: ModelLoadParams,
    hints: TemplateHints,
    cancel: &'a AtomicBool,
}

/// Request body for a probe. `fields` replace the base values.
fn request_body(
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
fn classify(status: StatusCode, text: &str, names: &[&str]) -> Reply {
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
fn names_field(lower: &str, name: &str) -> bool {
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
async fn send_once(session: &Session<'_>, body: &Value, names: &[&str]) -> Option<Reply> {
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
async fn read_stream(
    cancel: &AtomicBool,
    response: reqwest::Response,
    chunk_wait: Duration,
) -> Option<Reply> {
    read_chunks(cancel, response.bytes_stream(), chunk_wait).await
}

/// Reads chunks of a stream into a `StreamedReply`, as `read_stream` does. Each chunk must arrive
/// within `chunk_wait`, so a server that goes silent mid-reply is inconclusive rather than waiting
/// forever. The timeout is per chunk, so a slow but steady stream is not cut.
async fn read_chunks<S, B, E>(
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
fn silence_message(what: &str, wait: Duration) -> String {
    format!("{what} for {} s", wait.as_secs_f64())
}

/// What a streamed reply has gathered so far, rebuilt into the shape of a whole reply.
#[derive(Debug, Default)]
struct StreamedReply {
    /// Every byte received, kept for a server that answers with one JSON body and no events.
    raw: Vec<u8>,
    /// Bytes of the line still being received.
    pending: Vec<u8>,
    content: String,
    reasoning: String,
    finish_reason: Option<String>,
    /// Number of `data:` events that parsed as JSON.
    events: usize,
    /// Text of an error event from the server, which ends the stream.
    error: Option<String>,
}

impl StreamedReply {
    /// Takes the next bytes of the stream. True when the thinking block has closed, so no more
    /// need to be read.
    fn push(&mut self, bytes: &[u8]) -> bool {
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
    fn take_line(&mut self, line: &str) -> bool {
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
    fn into_reply(self) -> Reply {
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
async fn send(session: &Session<'_>, body: &Value, names: &[&str]) -> Option<Reply> {
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
async fn ask(
    session: &Session<'_>,
    temperature: f64,
    fields: &[(&str, Value)],
) -> Result<Value, Verdict> {
    ask_naming(session, temperature, fields, &[]).await
}

/// `ask`, where an error that names one of `names` rejects the setting.
async fn ask_naming(
    session: &Session<'_>,
    temperature: f64,
    fields: &[(&str, Value)],
    names: &[&str],
) -> Result<Value, Verdict> {
    let body = request_body(&session.model, &session.load, temperature, fields);
    ask_body(session, &body, names).await
}

/// Sends a prepared body and maps the reply to a result, as `ask_naming` does.
async fn ask_body(session: &Session<'_>, body: &Value, names: &[&str]) -> Result<Value, Verdict> {
    match send(session, body, names).await {
        None => Err(Verdict::Cancelled),
        Some(Reply::Ok(value)) => Ok(value),
        Some(Reply::Rejected(text)) => Err(Verdict::Status(CapabilityStatus::Rejected, text)),
        Some(Reply::Inconclusive(text)) => Err(Verdict::NotRun(text)),
    }
}

fn finish_reason(reply: &Value) -> Option<&str> {
    reply["choices"][0]["finish_reason"].as_str()
}

fn content(reply: &Value) -> Option<&str> {
    reply["choices"][0]["message"]["content"].as_str()
}

/// Thinking markers, shared with the chat through `src/utils/thinking.ts`.
const THINKING_PATTERNS_JSON: &str = include_str!("../../../shared/thinking-patterns.json");

/// One open and close pair. The JSON's `name` and `note` are for people, so they are not read here.
#[derive(Debug, Deserialize)]
struct Pattern {
    open: String,
    close: String,
}

/// A marker removed from the answer. It never counts as thinking.
#[derive(Debug, Deserialize)]
struct StripMarker {
    text: String,
}

#[derive(Debug, Default, Deserialize)]
struct ThinkingPatterns {
    #[serde(default)]
    patterns: Vec<Pattern>,
    #[serde(default, rename = "stripOnly")]
    strip_only: Vec<StripMarker>,
}

/// The patterns from the shared JSON. An empty tag would match everywhere, so such entries are
/// dropped. A file that does not parse gives no patterns; `shared_thinking_files_parse` catches that.
fn thinking_patterns() -> &'static ThinkingPatterns {
    static PATTERNS: OnceLock<ThinkingPatterns> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        let mut loaded: ThinkingPatterns =
            serde_json::from_str(THINKING_PATTERNS_JSON).unwrap_or_default();
        loaded
            .patterns
            .retain(|p| !p.open.is_empty() && !p.close.is_empty());
        loaded.strip_only.retain(|m| !m.text.is_empty());
        loaded
    })
}

/// A reply split into its thinking and its answer. Same rules as `parseThinking` in the chat.
#[derive(Debug, PartialEq, Eq)]
struct ParsedReply {
    /// Reasoning text from every thinking block, trimmed. Empty blocks are left out.
    thinking: String,
    /// The answer with thinking blocks and strip-only markers removed, trimmed.
    #[allow(dead_code)] // Read by the shared-case test; the scan itself needs only `thinking`.
    answer: String,
    /// True while a block has been opened but not closed yet (still streaming).
    #[allow(dead_code)] // Read by the shared-case test; the scan itself needs only `thinking`.
    thinking_open: bool,
}

/// Every tag the parser reads: open and close tags, and strip-only markers.
fn all_tags(p: &ThinkingPatterns) -> impl Iterator<Item = &str> {
    p.patterns
        .iter()
        .flat_map(|pat| [pat.open.as_str(), pat.close.as_str()])
        .chain(p.strip_only.iter().map(|m| m.text.as_str()))
}

/// Length of the longest suffix of `text` that is a proper prefix of a tag. It is held back, since
/// it may be the start of a tag that is still streaming.
fn held_back_len(text: &str, p: &ThinkingPatterns) -> usize {
    let mut held = 0;
    for tag in all_tags(p) {
        for len in (held + 1..tag.len()).rev() {
            if tag.get(..len).is_some_and(|prefix| text.ends_with(prefix)) {
                held = len;
                break;
            }
        }
    }
    held
}

/// The earliest block open tag or strip-only marker in `text`, as (start, length, block). A longer
/// marker wins when two start at the same place. `block` is `None` for a strip-only marker.
fn next_marker<'a>(
    text: &str,
    p: &'a ThinkingPatterns,
) -> Option<(usize, usize, Option<&'a Pattern>)> {
    let opens = p.patterns.iter().filter_map(|pat| {
        text.find(pat.open.as_str())
            .map(|at| (at, pat.open.len(), Some(pat)))
    });
    let strips = p.strip_only.iter().filter_map(|m| {
        text.find(m.text.as_str())
            .map(|at| (at, m.text.len(), None))
    });
    opens
        .chain(strips)
        .min_by(|a, b| a.0.cmp(&b.0).then(b.1.cmp(&a.1)))
}

/// The implicit block at the start of the reply: the close tag of a pattern that comes before that
/// pattern's open tag, as (start of the close tag, its length). Not taken when a strip-only marker
/// comes before the close tag, so a final channel is not read as thinking.
fn implicit_close(text: &str, p: &ThinkingPatterns) -> Option<(usize, usize)> {
    let strip_at = p
        .strip_only
        .iter()
        .filter_map(|m| text.find(m.text.as_str()))
        .min()
        .unwrap_or(usize::MAX);
    p.patterns
        .iter()
        .filter_map(|pat| {
            let at = text.find(pat.close.as_str())?;
            let open = text.find(pat.open.as_str()).unwrap_or(usize::MAX);
            (strip_at >= at && open >= at).then_some((at, pat.close.len()))
        })
        .min_by_key(|(at, _)| *at)
}

/// Splits a reply into thinking and answer, with the same rules as the chat's `parseThinking`:
/// - A block is an open tag, then text, then its close tag.
/// - A close tag before any open tag of its pattern, at the start, closes an implicit block.
/// - Strip-only markers are removed from the answer and never count as thinking.
/// - An open tag with no close is still thinking (`thinking_open`).
/// - A partial tag at the end is held back from whichever part it would land in.
fn parse_thinking(text: &str) -> ParsedReply {
    let p = thinking_patterns();
    let mut thinking_parts: Vec<&str> = Vec::new();
    let mut answer_parts: Vec<&str> = Vec::new();
    let mut rest = text;
    let mut thinking_open = false;

    if let Some((at, close_len)) = implicit_close(rest, p) {
        thinking_parts.push(&rest[..at]);
        rest = &rest[at + close_len..];
    }

    while !rest.is_empty() {
        let Some((at, len, block)) = next_marker(rest, p) else {
            answer_parts.push(&rest[..rest.len() - held_back_len(rest, p)]);
            break;
        };
        answer_parts.push(&rest[..at]);
        rest = &rest[at + len..];
        let Some(pattern) = block else {
            continue;
        };

        match rest.find(pattern.close.as_str()) {
            Some(close) => {
                thinking_parts.push(&rest[..close]);
                rest = &rest[close + pattern.close.len()..];
            }
            None => {
                thinking_parts.push(&rest[..rest.len() - held_back_len(rest, p)]);
                thinking_open = true;
                break;
            }
        }
    }

    let thinking = thinking_parts
        .iter()
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    ParsedReply {
        thinking,
        answer: answer_parts.concat().trim().to_owned(),
        thinking_open,
    }
}

/// What a reply shows about thinking.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ThinkingSeen {
    /// No think block, and no reasoning text.
    None,
    /// A think block that was opened and closed.
    Closed,
    /// A think block was opened and is not closed yet, at the end of the reply.
    Open,
}

/// True when the reply has a closed block, or a block still open: the reply's thinking as the chat
/// shows it (the same parse), or non-empty `reasoning_content`.
///
/// The Qwen3.5 chat template prefills the assistant turn. With thinking on, the prefill is `<think>`,
/// so the reply starts inside the block and only `</think>` appears in the output. With thinking off,
/// the prefill is an empty `<think>\n\n</think>`, which is not part of the output. So `</think>`
/// alone counts as thinking, and a thinking-off reply should never contain it.
fn thinking_seen(reply: &Value) -> ThinkingSeen {
    let message = &reply["choices"][0]["message"];
    let content = message["content"].as_str().unwrap_or("");
    let reasoning = message["reasoning_content"].as_str().unwrap_or("").trim();
    let parsed = parse_thinking(content);
    if parsed.thinking_open {
        ThinkingSeen::Open
    } else if !parsed.thinking.is_empty() {
        ThinkingSeen::Closed
    } else if !reasoning.is_empty() {
        // Reasoning that is followed by the answer has ended; reasoning alone is still open.
        if content.trim().is_empty() {
            ThinkingSeen::Open
        } else {
            ThinkingSeen::Closed
        }
    } else {
        ThinkingSeen::None
    }
}

/// True when the reply shows thinking, closed or still open.
fn shows_thinking(reply: &Value) -> bool {
    thinking_seen(reply) != ThinkingSeen::None
}

/// True when a saved chat reply's text shows a think block, closed or still open. The same parse as
/// `thinking_seen`. A saved message keeps no `reasoning_content`, so only the text is read.
fn text_shows_thinking(content: &str) -> bool {
    let parsed = parse_thinking(content);
    parsed.thinking_open || !parsed.thinking.is_empty()
}

/// True when a streamed thinking reply has closed its block, so the rest need not be read. The
/// content holds a closing tag of some pattern and no block is still open after it. Reasoning
/// that has been followed by answer text has also ended.
fn thinking_closed(content: &str, reasoning: &str) -> bool {
    let has_close = thinking_patterns()
        .patterns
        .iter()
        .any(|pattern| content.contains(pattern.close.as_str()));
    (has_close && !parse_thinking(content).thinking_open)
        || (!reasoning.trim().is_empty() && !content.trim().is_empty())
}

/// True when the reply stopped on the token limit (`finish_reason` `length`).
fn hit_cap(reply: &Value) -> bool {
    finish_reason(reply) == Some("length")
}

/// Detail for a thinking-on reply that opened a block (a tag, or reasoning text with no answer after
/// it) and did not close it. A reply that hit the cap says so; otherwise the reply ended first.
fn open_detail(on: &Value, off_shows: bool) -> String {
    if hit_cap(on) {
        return format!(
            "The reply started a think block and did not finish within {THINK_STREAM_MAX_TOKENS} tokens."
        );
    }
    let off = if off_shows {
        "also shows thinking"
    } else {
        "none"
    };
    format!(
        "Thinking on: a think block opened and the reply ended before it closed. Thinking off: {off}."
    )
}

/// Outcome of the thinking probe from the reply with thinking on and the one with it off.
///
/// - Thinking on opened a block, closed or not, within the cap: `works`. The model shows that it
///   thinks, even if the block did not finish (see `open_detail`).
/// - Thinking on shows a closed block: `works` when thinking off shows none.
/// - No tag at all, with the thinking-on reply at the cap and the thinking-off reply finished (a
///   Qwen-style prefilled open tag, so the close tag is never seen): `works`. The switch changed the
///   reply, but the block was not seen.
/// - Otherwise both replies came back 200, so `accepted`, and the detail says what the replies showed.
fn thinking_outcome(on: &Value, off: &Value) -> (CapabilityStatus, String) {
    let on_seen = thinking_seen(on);
    let off_shows = shows_thinking(off);
    match on_seen {
        ThinkingSeen::Open => (CapabilityStatus::Works, open_detail(on, off_shows)),
        ThinkingSeen::Closed if off_shows => (
            CapabilityStatus::Accepted,
            "HTTP 200. A think block shows with thinking on and off, so the switch had no visible effect."
                .to_owned(),
        ),
        ThinkingSeen::Closed => (
            CapabilityStatus::Works,
            "Thinking on: the reply has a think block. Thinking off: none.".to_owned(),
        ),
        ThinkingSeen::None if hit_cap(on) && finish_reason(off) == Some("stop") => (
            CapabilityStatus::Works,
            format!(
                "The reply with thinking on ran past {THINK_STREAM_MAX_TOKENS} tokens, and the reply with thinking off finished. The switch changes the reply, but the closing tag was not seen."
            ),
        ),
        ThinkingSeen::None if off_shows => (
            CapabilityStatus::Accepted,
            "HTTP 200. A think block shows only with thinking off. Effect not confirmed.".to_owned(),
        ),
        ThinkingSeen::None => (
            CapabilityStatus::Accepted,
            "HTTP 200 with thinking on and off. No think block either way, so the model may not think."
                .to_owned(),
        ),
    }
}

/// Outcome of the grammar probe from its reply. `works` when the reply, trimmed, is exactly one of
/// the words the grammar allows. Any other 200 reply is `accepted`: the grammar was not seen to bite.
fn grammar_outcome(reply: &Value) -> (CapabilityStatus, String) {
    match content(reply).map(str::trim) {
        Some(text @ ("yes" | "no")) => (
            CapabilityStatus::Works,
            format!("The reply is \"{text}\", the only words the grammar allows."),
        ),
        Some(text) => (
            CapabilityStatus::Accepted,
            format!("HTTP 200. The reply \"{text}\" is not yes or no. Effect not confirmed."),
        ),
        None => (
            CapabilityStatus::Accepted,
            "HTTP 200 with no reply text. Effect not confirmed.".to_owned(),
        ),
    }
}

/// Number of tool calls in the reply. Zero when the field is missing or empty.
fn tool_call_count(reply: &Value) -> usize {
    reply["choices"][0]["message"]["tool_calls"]
        .as_array()
        .map_or(0, Vec::len)
}

/// Body of one thinking-probe request. Both requests send `THINKING_PROMPT` at temperature 0, so only
/// the switch differs. The thinking-on request streams and has the larger cap; the thinking-off
/// request is a plain request with the short cap. With `think_token`, the thinking-on request also
/// carries the think token, which a template such as Gemma 4's reads instead of `enable_think`.
fn thinking_body(model: &str, load: &ModelLoadParams, think: bool, think_token: bool) -> Value {
    let max_tokens = if think {
        THINK_STREAM_MAX_TOKENS
    } else {
        THINK_MAX_TOKENS
    };
    let mut messages = vec![json!({ "role": "user", "content": THINKING_PROMPT })];
    if think && think_token {
        with_think_token(&mut messages);
    }
    request_body(
        model,
        load,
        0.0,
        &[
            ("messages", json!(messages)),
            ("enable_think", json!(think)),
            ("max_tokens", json!(max_tokens)),
            ("stream", json!(think)),
        ],
    )
}

/// Thinking probe: the same prompt with thinking on, then off, at temperature 0.
async fn probe_thinking(session: &Session<'_>) -> Verdict {
    let think_token = capabilities::summary_for(&session.model)
        .await
        .map(|summary| summary.think_token)
        .unwrap_or(false);
    let on = match ask_body(
        session,
        &thinking_body(&session.model, &session.load, true, think_token),
        &["enable_think"],
    )
    .await
    {
        Ok(reply) => reply,
        Err(verdict) => return verdict,
    };
    let off = match ask_body(
        session,
        &thinking_body(&session.model, &session.load, false, think_token),
        &["enable_think"],
    )
    .await
    {
        Ok(reply) => reply,
        Err(verdict) => return verdict,
    };
    let (status, detail) = thinking_outcome(&on, &off);
    Verdict::Status(status, detail)
}

/// Grammar probe: one question whose answer the grammar limits to `yes` or `no`, with a short cap.
async fn probe_grammar(session: &Session<'_>, grammar: Value) -> Verdict {
    let fields = [
        (
            "messages",
            json!([{ "role": "user", "content": GRAMMAR_PROMPT }]),
        ),
        ("max_tokens", json!(GRAMMAR_MAX_TOKENS)),
        ("grammar_string", grammar),
    ];
    match ask_naming(session, 0.0, &fields, &["grammar_string", "grammar"]).await {
        Ok(reply) => {
            let (status, detail) = grammar_outcome(&reply);
            Verdict::Status(status, detail)
        }
        Err(verdict) => verdict,
    }
}

/// Tool-call probe: one prompt that needs the `get_weather` tool, with thinking off.
async fn probe_tool_calls(session: &Session<'_>, tools: Value) -> Verdict {
    let fields = [
        (
            "messages",
            json!([{ "role": "user", "content": TOOL_PROMPT }]),
        ),
        ("tools", tools),
        ("max_tokens", json!(TOOL_MAX_TOKENS)),
    ];
    match ask_naming(session, 0.0, &fields, &["tools"]).await {
        Ok(reply) => match tool_call_count(&reply) {
            0 => Verdict::Status(
                CapabilityStatus::Accepted,
                "HTTP 200 with no tool call. The tools field was accepted, but the model did not call the tool."
                    .to_owned(),
            ),
            n => Verdict::Status(
                CapabilityStatus::Works,
                format!("The reply has {n} tool call(s) for get_weather."),
            ),
        },
        Err(verdict) => verdict,
    }
}

/// Body of the vision request: one user message with the image part and the question. Temperature 0,
/// thinking off, and the recipe's load parameters.
fn vision_body(model: &str, load: &ModelLoadParams, image_url: &Value) -> Value {
    request_body(
        model,
        load,
        0.0,
        &[
            (
                "messages",
                json!([{
                    "role": "user",
                    "content": [
                        { "type": "image_url", "image_url": { "url": image_url } },
                        { "type": "text", "text": VISION_PROMPT },
                    ]
                }]),
            ),
            ("max_tokens", json!(VISION_MAX_TOKENS)),
        ],
    )
}

/// Body of the audio request: one user message with the WAV part and the question. Temperature 0,
/// thinking off, and the recipe's load parameters.
fn audio_body(model: &str, load: &ModelLoadParams, wav_base64: &Value) -> Value {
    request_body(
        model,
        load,
        0.0,
        &[
            (
                "messages",
                json!([{
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": { "data": wav_base64, "format": "wav" }
                        },
                        { "type": "text", "text": AUDIO_PROMPT },
                    ]
                }]),
            ),
            ("max_tokens", json!(AUDIO_MAX_TOKENS)),
        ],
    )
}

/// True when `word` occurs in `text` as a whole word, ignoring ASCII case. A word is a run of ASCII
/// letters and digits, so `red` is not in `scared` or `hundred`, and `3` is not in `13` or `30`.
fn has_word(text: &str, word: &str) -> bool {
    text.split(|c: char| !c.is_ascii_alphanumeric())
        .any(|part| part.eq_ignore_ascii_case(word))
}

/// Outcome of the vision probe. `works` when the trimmed reply has "red" as a whole word, ignoring
/// case. Any other 200 reply is `accepted`: the image was not seen.
fn vision_outcome(reply: &Value) -> (CapabilityStatus, String) {
    match content(reply).map(str::trim) {
        Some(text) if has_word(text, "red") => (
            CapabilityStatus::Works,
            format!("The reply \"{text}\" names red, so the image was seen."),
        ),
        _ => (
            CapabilityStatus::Accepted,
            "HTTP 200. The reply does not name the colour, so the image was not seen.".to_owned(),
        ),
    }
}

/// Outcome of the audio probe. `works` when the trimmed reply has "three" or "3" as a whole word,
/// ignoring case. Any other 200 reply is `accepted`: the audio was not heard.
fn audio_outcome(reply: &Value) -> (CapabilityStatus, String) {
    match content(reply).map(str::trim) {
        Some(text) => {
            if has_word(text, "three") || has_word(text, "3") {
                return (
                    CapabilityStatus::Works,
                    format!("The reply \"{text}\" names three, so the audio was heard."),
                );
            }
            (
                CapabilityStatus::Accepted,
                "HTTP 200. The reply does not name three, so the audio was not heard.".to_owned(),
            )
        }
        None => (
            CapabilityStatus::Accepted,
            "HTTP 200 with no reply text. The audio was not heard.".to_owned(),
        ),
    }
}

/// Reads a 200 reply into a status and detail.
type Outcome = fn(&Value) -> (CapabilityStatus, String);

/// The verdict for one probe reply. `outcome` reads a 200 reply. A rejection is `rejected` with the
/// server's text, and an inconclusive reply is not run. `None` is a cancelled request.
fn verdict_for_reply(reply: Option<Reply>, outcome: Outcome) -> Verdict {
    match reply {
        None => Verdict::Cancelled,
        Some(Reply::Ok(value)) => {
            let (status, detail) = outcome(&value);
            Verdict::Status(status, detail)
        }
        Some(Reply::Rejected(text)) => Verdict::Status(CapabilityStatus::Rejected, text),
        Some(Reply::Inconclusive(text)) => Verdict::NotRun(text),
    }
}

/// Vision probe: the red image with a question about its colour. A 400 or 422 rejects it; any other
/// failure is inconclusive.
async fn probe_vision(session: &Session<'_>, image_url: &Value) -> Verdict {
    let body = vision_body(&session.model, &session.load, image_url);
    verdict_for_reply(send(session, &body, &[]).await, vision_outcome)
}

/// Audio probe: the spoken "one, two, three" with a question about the number words. Rejection and
/// inconclusive replies are as for the vision probe.
async fn probe_audio(session: &Session<'_>, wav_base64: &Value) -> Verdict {
    let body = audio_body(&session.model, &session.load, wav_base64);
    verdict_for_reply(send(session, &body, &[]).await, audio_outcome)
}

/// Probes one key and returns its verdict.
async fn probe_key(session: &Session<'_>, key: CapabilityKey) -> Verdict {
    if let Some(detail) = template_skip(key, session.hints) {
        return Verdict::Template(detail);
    }
    let (field, value, check) = probe_for(key);
    match check {
        Check::Thinking => probe_thinking(session).await,
        Check::ToolCalls => probe_tool_calls(session, value).await,
        Check::Grammar => probe_grammar(session, value).await,
        Check::Vision => probe_vision(session, &value).await,
        Check::Audio => probe_audio(session, &value).await,
        Check::AcceptedOnly => match ask(session, 0.0, &[(field, value)]).await {
            Ok(_) => Verdict::Status(
                CapabilityStatus::Accepted,
                format!("HTTP 200. No output check for {field}."),
            ),
            Err(verdict) => verdict,
        },
        Check::OutputCut => match ask(session, 0.0, &[(field, value)]).await {
            Ok(reply) => match finish_reason(&reply) {
                Some("length") => Verdict::Status(
                    CapabilityStatus::Works,
                    format!("Reply stopped at the limit: finish_reason length, {field} 4."),
                ),
                other => Verdict::Status(
                    CapabilityStatus::Accepted,
                    format!(
                        "HTTP 200, finish_reason {}. The cut was not seen.",
                        other.unwrap_or("missing")
                    ),
                ),
            },
            Err(verdict) => verdict,
        },
        Check::SameSeed => {
            let seed = value.to_string();
            let first = match ask(session, 1.0, &[(field, value.clone())]).await {
                Ok(reply) => reply,
                Err(verdict) => return verdict,
            };
            let second = match ask(session, 1.0, &[(field, value)]).await {
                Ok(reply) => reply,
                Err(verdict) => return verdict,
            };
            match content(&first) {
                Some(text) if content(&second) == Some(text) => Verdict::Status(
                    CapabilityStatus::Works,
                    format!("Two runs with seed {seed} gave the same reply."),
                ),
                _ => Verdict::Status(
                    CapabilityStatus::Accepted,
                    format!(
                        "Two runs with seed {seed} gave different replies. Effect not confirmed."
                    ),
                ),
            }
        }
    }
}

/// True when the server lists the model, with or without a precision suffix.
fn is_loaded(loaded: &[String], name: &str) -> bool {
    loaded
        .iter()
        .any(|m| m == name || m.starts_with(&format!("{name}:")))
}

/// The model's fingerprint now: its weights file and the GenieX version. A model with no GGUF
/// file (AI Hub bundles) has size 0 and mtime 0, so only the GenieX version can make it stale.
async fn current_fingerprint(name: &str) -> Result<Fingerprint, String> {
    let folder = model_folder(name)?;
    let files = tokio::task::spawn_blocking(move || scan_folder(&folder))
        .await
        .map_err(|e| format!("Model file read failed: {e}"))?;
    let (size, mtime) = match files.main {
        Some(main) => (
            main.size,
            main.modified
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).timestamp_millis())
                .unwrap_or(0),
        ),
        None => (0, 0),
    };
    let geniex = get_installed_version_timeout(CLI_PROBE_TIMEOUT_SECS)
        .await
        .unwrap_or_else(|| "unknown".to_owned());
    Ok(Fingerprint {
        size,
        mtime,
        geniex,
    })
}

/// Entries for the keys that have a stored result, in scan order, marked stale against `current`.
fn entries(
    records: &HashMap<CapabilityKey, CapabilityRecord>,
    current: &Fingerprint,
) -> Vec<CapabilityEntry> {
    CapabilityKey::ALL
        .iter()
        .filter_map(|key| {
            records
                .get(key)
                .map(|r| CapabilityEntry::new(*key, r, current))
        })
        .collect()
}

/// Records a saved chat reply that shows a think block as thinking evidence for `model`. Called when
/// a message is saved. Only positive evidence is recorded: a reply without a block changes nothing.
/// A confirmed thinking result is left alone, so the model file is not read again. The write goes
/// through `model_capabilities::save`, which applies the write-once rule.
pub(super) async fn note_saved_reply(
    db: &DatabaseConnection,
    model: &str,
    content: &str,
) -> Result<(), String> {
    if !text_shows_thinking(content) {
        return Ok(());
    }
    let name = strip_precision(model).to_string();
    // Refuses a name that could leave the model cache, before anything is read or written.
    model_folder(&name)?;
    let existing = model_capabilities::load(db, &name).await?;
    if existing
        .get(&CapabilityKey::Thinking)
        .is_some_and(CapabilityRecord::is_confirmed)
    {
        return Ok(());
    }
    let record = CapabilityRecord {
        status: CapabilityStatus::Works,
        detail: Some("A saved reply shows a think block.".to_owned()),
        probed_at: chrono::Utc::now().timestamp_millis(),
        fingerprint: current_fingerprint(&name).await?,
        source: CapabilitySource::Conversation,
    };
    model_capabilities::save(db, &name, vec![(CapabilityKey::Thinking, Some(record))]).await
}

/// Result of a scan: whether it was cancelled, and the model's stored results afterwards.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub cancelled: bool,
    pub entries: Vec<CapabilityEntry>,
}

/// Payload of `capability-scan-progress`.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgress<'a> {
    model: &'a str,
    key: &'static str,
    index: usize,
    total: usize,
}

/// One line per decided setting in the server logs. Not run and cancelled settings are not logged
/// as results.
fn log_verdict(app: &AppHandle, model: &str, key: CapabilityKey, verdict: &Verdict) {
    let line = match verdict {
        Verdict::Status(status, detail) => {
            format!(
                "[probe] {model} {}: {} - {detail}",
                key.name(),
                status.as_str()
            )
        }
        Verdict::Template(detail) => format!(
            "[probe] {model} {}: {} - {detail}",
            key.name(),
            CapabilityStatus::Accepted.as_str()
        ),
        Verdict::NotRun(detail) => format!("[probe] {model} {}: not run - {detail}", key.name()),
        Verdict::Cancelled => return,
    };
    logs::record(app, "stdout", line);
}

/// Stored results for a model, with staleness against the file and GenieX version now.
#[tauri::command]
pub async fn load_model_capabilities(
    db: State<'_, DatabaseConnection>,
    model: String,
) -> Result<Vec<CapabilityEntry>, String> {
    let name = strip_precision(&model).to_string();
    let fingerprint = current_fingerprint(&name).await?;
    let records = model_capabilities::load(&db, &name).await?;
    Ok(entries(&records, &fingerprint))
}

/// Probes the sampling settings of a loaded model and saves the results. The model must already
/// be loaded; the scan does not load it. Emits `capability-scan-progress` before each setting.
/// Settings not reached after a cancel keep their stored results.
///
/// `load` is the model's load parameters as chat sends them. It is accepted so the frontend call
/// does not change, but the probes always send `probe_recipe()` instead, whatever is passed here.
#[tauri::command]
pub async fn scan_model_capabilities(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, DatabaseConnection>,
    model: String,
    load: Option<ModelLoadParams>,
    base_url: Option<String>,
) -> Result<ScanResult, String> {
    // The caller's load parameters do not reach the probes. See the doc comment above.
    let _ = load;
    let _guard = ScanGuard::begin()?;
    let name = strip_precision(&model).to_string();

    // The server the app is configured for. The default applies only when none is given.
    let base = base_url.unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
    let loaded = fetch_loaded_models(&state.http_client, &base)
        .await
        .map_err(|e| format!("GenieX server is not reachable: {e}"))?;
    if !is_loaded(&loaded, &name) {
        return Err(format!(
            "{name} is not loaded on the server. Load it first; the scan does not load models."
        ));
    }
    let fingerprint = current_fingerprint(&name).await?;
    // An unreadable model file leaves the hints unknown, so every probe runs.
    let hints = capabilities::summary_for(&name)
        .await
        .map(|summary| TemplateHints {
            thinking: summary.thinking_hint,
            tool_calls: summary.tool_call_hint,
            vision: Some(summary.has_vision_projector),
            audio: summary.has_audio_encoder,
        })
        .unwrap_or_default();

    let session = Session {
        client: &state.http_client,
        url: format!("{base}/v1/chat/completions"),
        model: name.clone(),
        load: probe_recipe(),
        hints,
        cancel: &SCAN_CANCEL,
    };

    // A plain request first: if the server cannot answer that, no setting can be tested.
    let mut cancelled = match ask(&session, 0.0, &[]).await {
        Ok(_) => false,
        Err(Verdict::Cancelled) => true,
        Err(Verdict::NotRun(text)) => return Err(format!("Baseline request failed: {text}")),
        // A plain request has no template skip, so `Template` cannot come back here.
        Err(Verdict::Status(_, text) | Verdict::Template(text)) => {
            return Err(format!("Baseline request was refused: {text}"))
        }
    };

    let mut results: Vec<(CapabilityKey, Verdict)> = Vec::new();
    let total = CapabilityKey::ALL.len();
    for (index, key) in CapabilityKey::ALL.iter().copied().enumerate() {
        if cancelled || SCAN_CANCEL.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        let _ = app.emit(
            PROGRESS_EVENT,
            ScanProgress {
                model: name.as_str(),
                key: key.name(),
                index,
                total,
            },
        );
        let verdict = probe_key(&session, key).await;
        if matches!(verdict, Verdict::Cancelled) {
            cancelled = true;
            break;
        }
        log_verdict(&app, &name, key, &verdict);
        results.push((key, verdict));
    }

    // A decided setting is saved. A not-run one loses its row, unless it is confirmed; `save` applies
    // the write-once rule.
    let updates: Vec<(CapabilityKey, Option<CapabilityRecord>)> = results
        .into_iter()
        .map(|(key, verdict)| {
            let (status, detail, source) = match verdict {
                Verdict::Status(status, detail) => (status, detail, CapabilitySource::Probe),
                Verdict::Template(detail) => (
                    CapabilityStatus::Accepted,
                    detail,
                    CapabilitySource::Template,
                ),
                Verdict::NotRun(_) | Verdict::Cancelled => {
                    return (key, None);
                }
            };
            let record = Some(CapabilityRecord {
                status,
                detail: Some(detail),
                probed_at: chrono::Utc::now().timestamp_millis(),
                fingerprint: fingerprint.clone(),
                source,
            });
            (key, record)
        })
        .collect();
    if !updates.is_empty() {
        model_capabilities::save(&db, &name, updates).await?;
    }

    let records = model_capabilities::load(&db, &name).await?;
    Ok(ScanResult {
        cancelled,
        entries: entries(&records, &fingerprint),
    })
}

/// Asks the running scan to stop. It stops before the next setting, and any request in flight is
/// dropped.
#[tauri::command]
pub fn cancel_capability_scan() -> Result<(), String> {
    SCAN_CANCEL.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_key_has_a_probe_that_sends_a_value() {
        for key in CapabilityKey::ALL {
            let (field, value, _) = probe_for(*key);
            assert!(!field.is_empty(), "{} has no field", key.name());
            assert!(!value.is_null(), "{} has no value", key.name());
        }
        assert!(matches!(probe_for(CapabilityKey::Seed).2, Check::SameSeed));
        assert!(matches!(
            probe_for(CapabilityKey::MaxTokens).2,
            Check::OutputCut
        ));
    }

    #[test]
    fn probe_body_is_short_and_keeps_the_load_params() {
        let load = ModelLoadParams {
            nctx: Some(4096),
            ..Default::default()
        };
        let body = request_body("org/model", &load, 0.0, &[("top_k", json!(5))]);
        assert_eq!(body["model"], "org/model");
        assert_eq!(body["stream"], false);
        assert_eq!(body["temperature"], 0.0);
        assert_eq!(body["max_tokens"], BASE_MAX_TOKENS);
        assert_eq!(body["top_k"], 5);
        assert_eq!(body["enable_think"], false);
        assert_eq!(
            body["nctx"], 4096,
            "load params keep the server from reloading"
        );
    }

    #[test]
    fn probe_fields_replace_the_base_values() {
        let body = request_body(
            "m",
            &ModelLoadParams::default(),
            1.0,
            &[("max_tokens", json!(4))],
        );
        assert_eq!(body["max_tokens"], 4);
        assert_eq!(body["temperature"], 1.0);
        assert!(body.get("nctx").is_none(), "unset load params are not sent");
    }

    #[test]
    fn success_needs_a_json_body() {
        assert!(matches!(
            classify(StatusCode::OK, r#"{"choices":[]}"#, &[]),
            Reply::Ok(_)
        ));
        assert!(matches!(
            classify(StatusCode::OK, "<html>", &[]),
            Reply::Inconclusive(_)
        ));
    }

    #[test]
    fn a_bad_request_is_rejected_with_the_raw_text() {
        match classify(StatusCode::BAD_REQUEST, "  top_k must be positive  ", &[]) {
            Reply::Rejected(detail) => {
                assert!(detail.contains("top_k must be positive"));
                assert!(detail.starts_with("400"));
            }
            other => panic!("expected rejection, got {other:?}"),
        }
    }

    #[test]
    fn an_error_that_names_the_value_is_rejected_even_with_a_5xx_status() {
        assert!(matches!(
            classify(StatusCode::INTERNAL_SERVER_ERROR, "invalid seed value", &[]),
            Reply::Rejected(_)
        ));
    }

    #[test]
    fn timeouts_and_plain_server_failures_are_inconclusive() {
        assert!(matches!(
            classify(StatusCode::INTERNAL_SERVER_ERROR, "out of memory", &[]),
            Reply::Inconclusive(_)
        ));
        assert!(matches!(
            classify(StatusCode::REQUEST_TIMEOUT, "", &[]),
            Reply::Inconclusive(_)
        ));
        assert!(matches!(
            classify(StatusCode::TOO_MANY_REQUESTS, "busy", &[]),
            Reply::Inconclusive(_)
        ));
        assert!(matches!(
            classify(StatusCode::NOT_FOUND, "no route", &[]),
            Reply::Inconclusive(_)
        ));
    }

    #[test]
    fn loaded_check_ignores_the_precision_suffix() {
        let loaded = vec!["org/model:Q4_K_M".to_owned()];
        assert!(is_loaded(&loaded, "org/model"));
        assert!(!is_loaded(&loaded, "org/other"));
        assert!(!is_loaded(&loaded, "org/mod"));
    }

    /// A chat reply whose message is `message`.
    fn reply_with(message: Value) -> Value {
        reply_with_finish("stop", message)
    }

    /// A chat reply with `finish_reason` and `message`.
    fn reply_with_finish(finish_reason: &str, message: Value) -> Value {
        json!({ "choices": [{ "finish_reason": finish_reason, "message": message }] })
    }

    /// One server-sent event carrying `content` as the delta.
    fn sse(content: &str) -> String {
        format!(
            "data: {}\n\n",
            json!({ "choices": [{ "delta": { "content": content } }] })
        )
    }

    #[test]
    fn thinking_probe_is_works_only_when_the_think_block_follows_the_switch() {
        let on = reply_with(json!({ "content": "<think>Counting.</think>1 2 3" }));
        let off = reply_with(json!({ "content": "1 2 3" }));
        assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Works);

        let on_by_field =
            reply_with(json!({ "content": "1 2 3", "reasoning_content": "Counting." }));
        assert_eq!(
            thinking_outcome(&on_by_field, &off).0,
            CapabilityStatus::Works
        );
    }

    #[test]
    fn thinking_probe_is_works_when_only_the_closing_tag_shows() {
        // The template prefilled the opening tag, so the reply has `</think>` but no `<think>`.
        let on = reply_with(json!({ "content": "Counting...</think>1 2 3" }));
        let off = reply_with(json!({ "content": "1 2 3" }));
        assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Works);
    }

    #[test]
    fn thinking_probe_is_accepted_when_only_the_off_reply_has_a_closing_tag() {
        let on = reply_with(json!({ "content": "1 2 3" }));
        let off = reply_with(json!({ "content": "Counting...</think>1 2 3" }));
        assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Accepted);
    }

    #[test]
    fn thinking_probe_is_accepted_when_no_think_block_shows_either_way() {
        let plain = reply_with(json!({ "content": "1 2 3" }));
        let (status, detail) = thinking_outcome(&plain, &plain);
        assert_eq!(status, CapabilityStatus::Accepted);
        assert!(detail.contains("may not think"));
    }

    #[test]
    fn thinking_probe_is_accepted_when_thinking_shows_with_the_switch_off() {
        let think = reply_with(json!({ "content": "<think>x</think>1" }));
        let plain = reply_with(json!({ "content": "1" }));
        assert_eq!(
            thinking_outcome(&plain, &think).0,
            CapabilityStatus::Accepted
        );
        assert_eq!(
            thinking_outcome(&think, &think).0,
            CapabilityStatus::Accepted
        );
    }

    #[test]
    fn empty_reasoning_content_is_not_thinking() {
        let reply = reply_with(json!({ "content": "1", "reasoning_content": "  " }));
        assert!(!shows_thinking(&reply));
        assert!(!shows_thinking(&json!({})));
    }

    #[test]
    fn tool_call_probe_counts_a_non_empty_tool_calls_array() {
        let called = reply_with(json!({
            "content": null,
            "tool_calls": [{ "type": "function", "function": { "name": "get_weather", "arguments": "{\"city\":\"Paris\"}" } }]
        }));
        assert_eq!(tool_call_count(&called), 1);

        let empty = reply_with(json!({ "content": "It is sunny.", "tool_calls": [] }));
        assert_eq!(tool_call_count(&empty), 0);
        assert_eq!(tool_call_count(&json!({})), 0);
    }

    #[test]
    fn a_400_that_names_the_thinking_field_is_rejected() {
        match classify(
            StatusCode::BAD_REQUEST,
            "enable_think is not a boolean",
            &["enable_think"],
        ) {
            Reply::Rejected(detail) => assert!(detail.starts_with("400")),
            other => panic!("expected rejection, got {other:?}"),
        }
    }

    #[test]
    fn a_5xx_that_names_the_tools_field_is_rejected_only_for_that_probe() {
        assert!(matches!(
            classify(
                StatusCode::INTERNAL_SERVER_ERROR,
                "tools payload failed to parse",
                &["tools"],
            ),
            Reply::Rejected(_)
        ));
        assert!(matches!(
            classify(
                StatusCode::INTERNAL_SERVER_ERROR,
                "tools payload failed to parse",
                &[]
            ),
            Reply::Inconclusive(_)
        ));
    }

    #[test]
    fn new_probes_send_their_own_fields() {
        let (field, value, check) = probe_for(CapabilityKey::Thinking);
        assert_eq!(field, "enable_think");
        assert_eq!(value, json!(true));
        assert!(matches!(check, Check::Thinking));

        let (field, value, check) = probe_for(CapabilityKey::ToolCalls);
        assert_eq!(field, "tools");
        assert_eq!(value[0]["function"]["name"], "get_weather");
        assert!(matches!(check, Check::ToolCalls));
    }

    #[test]
    fn the_scan_runs_fourteen_keys_with_vision_and_audio_last() {
        assert_eq!(CapabilityKey::ALL.len(), 14);
        assert_eq!(CapabilityKey::ALL[12], CapabilityKey::Vision);
        assert_eq!(CapabilityKey::ALL.last(), Some(&CapabilityKey::Audio));
    }

    #[test]
    fn thinking_probe_uses_the_thinking_prompt_for_both_requests() {
        let load = ModelLoadParams::default();
        let on = thinking_body("m", &load, true, false);
        let off = thinking_body("m", &load, false, false);
        for body in [&on, &off] {
            assert_eq!(body["messages"][0]["content"], THINKING_PROMPT);
            assert_eq!(body["messages"].as_array().map(Vec::len), Some(1));
            assert_eq!(body["temperature"], 0.0);
        }
        assert_eq!(THINKING_PROMPT, "Is 221 a prime number? Explain briefly.");
        assert_ne!(
            THINKING_PROMPT, PROMPT,
            "other probes keep the count prompt"
        );
    }

    #[test]
    fn thinking_on_streams_with_the_cap_and_thinking_off_does_not() {
        let load = ModelLoadParams::default();
        let on = thinking_body("m", &load, true, false);
        assert_eq!(on["stream"], true);
        assert_eq!(on["enable_think"], true);
        assert_eq!(on["max_tokens"], 1024);

        let off = thinking_body("m", &load, false, false);
        assert_eq!(off["stream"], false);
        assert_eq!(off["enable_think"], false);
        assert_eq!(off["max_tokens"], THINK_MAX_TOKENS);
    }

    #[test]
    fn the_thinking_probe_detail_names_the_cap_when_a_block_is_still_open() {
        let on = reply_with_finish(
            "length",
            json!({ "content": "<think>Two divisors, so 221 is" }),
        );
        let off = reply_with(json!({ "content": "No. 221 is 13 times 17." }));
        let (status, detail) = thinking_outcome(&on, &off);
        assert_eq!(status, CapabilityStatus::Works);
        assert_eq!(
            detail,
            "The reply started a think block and did not finish within 1024 tokens."
        );
        assert!(!detail.contains("no think block"));
        assert!(!detail.contains("may not think"));
    }

    #[test]
    fn a_gemma_style_block_open_at_the_cap_is_works() {
        let on = reply_with_finish(
            "length",
            json!({ "content": "<|channel>thought\nTwo divisors, so 221 is" }),
        );
        let off = reply_with(json!({ "content": "No. 221 is 13 times 17." }));
        assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Works);
    }

    #[test]
    fn a_prefilled_open_tag_past_the_cap_with_a_short_off_reply_is_works() {
        // Qwen-style: no tag in the reply with thinking on, which ran to the cap. Thinking off finished.
        let on = reply_with_finish("length", json!({ "content": "Two divisors, so 221 is" }));
        let off = reply_with_finish("stop", json!({ "content": "No." }));
        let (status, detail) = thinking_outcome(&on, &off);
        assert_eq!(status, CapabilityStatus::Works);
        assert_eq!(
            detail,
            "The reply with thinking on ran past 1024 tokens, and the reply with thinking off finished. The switch changes the reply, but the closing tag was not seen."
        );
    }

    #[test]
    fn a_prefilled_open_tag_is_accepted_when_both_replies_hit_the_cap() {
        let on = reply_with_finish("length", json!({ "content": "Two divisors, so 221 is" }));
        let off = reply_with_finish("length", json!({ "content": "No. 221 is 13 times 17." }));
        let (status, detail) = thinking_outcome(&on, &off);
        assert_eq!(status, CapabilityStatus::Accepted);
        assert!(detail.contains("may not think"));
    }

    #[test]
    fn no_tag_and_both_replies_short_is_accepted() {
        let on = reply_with_finish("stop", json!({ "content": "No." }));
        let off = reply_with_finish("stop", json!({ "content": "No." }));
        let (status, detail) = thinking_outcome(&on, &off);
        assert_eq!(status, CapabilityStatus::Accepted);
        assert!(detail.contains("may not think"));
    }

    #[test]
    fn the_thinking_probe_is_works_when_the_block_closes_within_the_cap() {
        let on = reply_with_finish(
            "stop",
            json!({ "content": "<think>221 = 13 x 17.</think>No, 221 is not prime." }),
        );
        let off = reply_with(json!({ "content": "No, 221 is not prime." }));
        assert_eq!(thinking_outcome(&on, &off).0, CapabilityStatus::Works);
    }

    #[test]
    fn the_thinking_probe_is_works_when_the_block_is_open_but_the_reply_ended() {
        let on = reply_with_finish("stop", json!({ "content": "<think>Checking 221" }));
        let off = reply_with(json!({ "content": "No." }));
        let (status, detail) = thinking_outcome(&on, &off);
        assert_eq!(status, CapabilityStatus::Works);
        assert!(detail.contains("ended before it closed"));
    }

    #[test]
    fn the_thinking_probe_with_no_block_keeps_the_may_not_think_detail() {
        // Both replies hit the cap, so the switch's effect is not seen and the result stays accepted.
        let on = reply_with_finish("length", json!({ "content": "No. 221 is 13 times 17." }));
        let off = reply_with_finish("length", json!({ "content": "No. 221 is 13 times 17." }));
        let (status, detail) = thinking_outcome(&on, &off);
        assert_eq!(status, CapabilityStatus::Accepted);
        assert!(detail.contains("may not think"));
        assert!(!detail.contains("did not finish"));
    }

    #[test]
    fn thinking_seen_tells_closed_from_open() {
        let closed = reply_with(json!({ "content": "<think>x</think>1" }));
        let open = reply_with(json!({ "content": "<think>x" }));
        let none = reply_with(json!({ "content": "1" }));
        assert_eq!(thinking_seen(&closed), ThinkingSeen::Closed);
        assert_eq!(thinking_seen(&open), ThinkingSeen::Open);
        assert_eq!(thinking_seen(&none), ThinkingSeen::None);
    }

    #[test]
    fn a_stream_stops_once_the_think_block_closes() {
        let mut streamed = StreamedReply::default();
        assert!(!streamed.push(sse("<think>Two divis").as_bytes()));
        // The closing tag arrives split across two network chunks.
        assert!(!streamed.push(sse("ors.</thi").as_bytes()));
        assert!(streamed.push(sse("nk>No, 221 is 13 x 17.").as_bytes()));
        let Reply::Ok(reply) = streamed.into_reply() else {
            panic!("expected a reply");
        };
        assert_eq!(
            thinking_outcome(&reply, &reply_with(json!({ "content": "No." }))).0,
            CapabilityStatus::Works
        );
        assert_eq!(
            content(&reply),
            Some("<think>Two divisors.</think>No, 221 is 13 x 17.")
        );
    }

    #[test]
    fn a_stream_cut_at_the_cap_reads_as_thinking_started() {
        let mut streamed = StreamedReply::default();
        assert!(!streamed.push(sse("<think>Two divisors, so").as_bytes()));
        assert!(!streamed.push(b"data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n\n"));
        assert!(!streamed.push(b"data: [DONE]\n\n"));
        let Reply::Ok(reply) = streamed.into_reply() else {
            panic!("expected a reply");
        };
        assert_eq!(reply["choices"][0]["finish_reason"], "length");
        let (status, detail) = thinking_outcome(&reply, &reply_with(json!({ "content": "No." })));
        assert_eq!(status, CapabilityStatus::Works);
        assert!(detail.contains("did not finish within 1024 tokens"));
    }

    #[tokio::test]
    async fn a_stalled_stream_is_inconclusive_not_no_thinking() {
        let cancel = AtomicBool::new(false);
        let stalled = futures_util::stream::pending::<Result<Vec<u8>, String>>();
        let reply = read_chunks(&cancel, Box::pin(stalled), Duration::from_millis(50))
            .await
            .expect("not cancelled");
        match reply {
            Reply::Inconclusive(detail) => assert!(detail.starts_with("no data for"), "{detail}"),
            other => panic!("expected inconclusive, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn a_steady_stream_is_not_cut_by_the_chunk_wait() {
        // Three chunks, 80 ms apart: 240 ms in all, past the 200 ms wait. Each chunk arrives inside
        // the wait, so the reply is read through to the closing tag.
        use futures_util::StreamExt;

        let cancel = AtomicBool::new(false);
        let chunks = ["<think>Two", " divisors.", "</think>No."];
        let slow = futures_util::stream::iter(chunks).then(|text| async move {
            tokio::time::sleep(Duration::from_millis(80)).await;
            Ok::<Vec<u8>, String>(sse(text).into_bytes())
        });
        let reply = read_chunks(&cancel, Box::pin(slow), Duration::from_millis(200))
            .await
            .expect("not cancelled");
        let Reply::Ok(reply) = reply else {
            panic!("expected a reply");
        };
        assert_eq!(content(&reply), Some("<think>Two divisors.</think>No."));
    }

    #[test]
    fn a_silent_wait_names_what_was_waited_for() {
        assert_eq!(
            silence_message(
                "no data",
                Duration::from_secs(CAPABILITY_PROBE_TIMEOUT_SECS)
            ),
            "no data for 60 s"
        );
        assert_eq!(
            silence_message("no response", Duration::from_secs(60)),
            "no response for 60 s"
        );
    }

    #[test]
    fn a_stream_error_event_is_inconclusive_not_no_thinking() {
        let mut streamed = StreamedReply::default();
        assert!(streamed.push(b"data: {\"error\":\"context full\",\"code\":5}\n\n"));
        assert!(matches!(streamed.into_reply(), Reply::Inconclusive(_)));
    }

    #[test]
    fn a_stream_that_is_one_json_body_is_read_as_a_reply() {
        let mut streamed = StreamedReply::default();
        assert!(!streamed.push(br#"{"choices":[{"message":{"content":"1 2 3"}}]}"#));
        let Reply::Ok(reply) = streamed.into_reply() else {
            panic!("expected a reply");
        };
        assert_eq!(content(&reply), Some("1 2 3"));
    }

    #[test]
    fn grammar_probe_sends_the_yes_no_grammar_with_a_short_cap() {
        let (field, value, check) = probe_for(CapabilityKey::GrammarString);
        assert_eq!(field, "grammar_string");
        assert_eq!(value, json!("root ::= \"yes\" | \"no\""));
        assert!(matches!(check, Check::Grammar));
        assert_eq!(GRAMMAR_MAX_TOKENS, 8);
    }

    #[test]
    fn grammar_probe_is_works_when_the_reply_is_yes_or_no() {
        let yes = reply_with(json!({ "content": "yes" }));
        assert_eq!(grammar_outcome(&yes).0, CapabilityStatus::Works);
        let no = reply_with(json!({ "content": " no\n" }));
        assert_eq!(grammar_outcome(&no).0, CapabilityStatus::Works);
    }

    #[test]
    fn grammar_probe_is_accepted_when_a_200_reply_is_not_yes_or_no() {
        let other = reply_with(json!({ "content": "Yes, it is." }));
        let (status, detail) = grammar_outcome(&other);
        assert_eq!(status, CapabilityStatus::Accepted);
        assert!(detail.contains("not yes or no"));
        assert_eq!(
            grammar_outcome(&reply_with(json!({ "content": null }))).0,
            CapabilityStatus::Accepted
        );
    }

    #[test]
    fn grammar_probe_is_rejected_on_400_or_an_error_that_names_the_grammar() {
        let names = ["grammar_string", "grammar"];
        assert!(matches!(
            classify(StatusCode::BAD_REQUEST, "bad grammar", &names),
            Reply::Rejected(_)
        ));
        assert!(matches!(
            classify(
                StatusCode::INTERNAL_SERVER_ERROR,
                "grammar_string failed to parse",
                &names
            ),
            Reply::Rejected(_)
        ));
        assert!(matches!(
            classify(StatusCode::INTERNAL_SERVER_ERROR, "out of memory", &names),
            Reply::Inconclusive(_)
        ));
    }

    #[test]
    fn a_tools_error_in_an_unrelated_sentence_is_not_a_rejection() {
        // "toolstack" is a different word, so this 5xx does not name the tools field.
        assert!(matches!(
            classify(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Toolstack rebuild failed while loading",
                &["tools"],
            ),
            Reply::Inconclusive(_)
        ));
    }

    #[test]
    fn a_tools_error_that_names_the_field_is_a_rejection() {
        for text in [
            "tools: expected an array",
            "\"tools\" must be a list",
            "unknown field tools",
            "{\"error\": \"bad tools\"}",
        ] {
            assert!(
                matches!(
                    classify(StatusCode::INTERNAL_SERVER_ERROR, text, &["tools"]),
                    Reply::Rejected(_)
                ),
                "{text} names the tools field"
            );
        }
    }

    #[test]
    fn a_400_is_a_rejection_whatever_the_text() {
        assert!(matches!(
            classify(
                StatusCode::BAD_REQUEST,
                "toolstack rebuild failed",
                &["tools"]
            ),
            Reply::Rejected(_)
        ));
    }

    #[test]
    fn names_match_whole_words_only() {
        assert!(names_field("the tools field", "tools"));
        assert!(names_field("tools", "tools"));
        assert!(!names_field("toolset", "tools"));
        assert!(!names_field("my_tools_cache", "tools"));
        assert!(!names_field("tools2", "tools"));
        assert!(names_field("enable_think is not a boolean", "enable_think"));
        assert!(!names_field("enable_thinking", "enable_think"));
    }

    #[test]
    fn reads_finish_reason_and_content_from_a_reply() {
        let reply =
            json!({"choices": [{"finish_reason": "length", "message": {"content": "1 2"}}]});
        assert_eq!(finish_reason(&reply), Some("length"));
        assert_eq!(content(&reply), Some("1 2"));
        assert_eq!(content(&json!({})), None);
    }

    const SHARED_CASES_JSON: &str = include_str!("../../../shared/thinking-cases.json");

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ExpectedSplit {
        thinking: String,
        answer: String,
        thinking_open: bool,
    }

    #[derive(Deserialize)]
    struct SharedCase {
        name: String,
        input: String,
        expected: ExpectedSplit,
    }

    #[test]
    fn shared_thinking_files_parse() {
        let patterns: ThinkingPatterns = serde_json::from_str(THINKING_PATTERNS_JSON)
            .expect("shared/thinking-patterns.json parses");
        assert!(!patterns.patterns.is_empty());
        assert!(!patterns.strip_only.is_empty());
        let cases: Vec<SharedCase> =
            serde_json::from_str(SHARED_CASES_JSON).expect("shared/thinking-cases.json parses");
        assert!(!cases.is_empty());
    }

    #[test]
    fn shared_cases_split_the_same_way_as_the_chat() {
        // The same file is checked by src/utils/thinking.test.ts.
        let cases: Vec<SharedCase> =
            serde_json::from_str(SHARED_CASES_JSON).expect("shared/thinking-cases.json parses");
        for case in cases {
            let parsed = parse_thinking(&case.input);
            assert_eq!(
                parsed.thinking, case.expected.thinking,
                "thinking: {}",
                case.name
            );
            assert_eq!(parsed.answer, case.expected.answer, "answer: {}", case.name);
            assert_eq!(
                parsed.thinking_open, case.expected.thinking_open,
                "thinkingOpen: {}",
                case.name
            );
        }
    }

    #[test]
    fn gemma_and_harmony_reasoning_show_thinking() {
        let gemma = reply_with(json!({ "content": "<|channel>thought\nx<channel|>1" }));
        assert!(shows_thinking(&gemma));
        let harmony = reply_with(
            json!({ "content": "<|channel|>analysis<|message|>x<|end|><|channel|>final<|message|>1" }),
        );
        assert!(shows_thinking(&harmony));
    }

    #[test]
    fn a_harmony_final_channel_alone_is_not_thinking() {
        let reply = reply_with(json!({ "content": "<|channel|>final<|message|>1 2 3<|return|>" }));
        assert!(!shows_thinking(&reply));
    }

    #[test]
    fn an_empty_think_block_is_not_thinking() {
        let reply = reply_with(json!({ "content": "<think>  </think>1" }));
        assert!(!shows_thinking(&reply));
    }

    #[test]
    fn the_probe_recipe_sends_nctx_4096_and_no_other_load_parameter() {
        let recipe = probe_recipe();
        assert_eq!(recipe.nctx, Some(4096));
        let mut body = json!({});
        apply_load_params(&mut body, &recipe);
        assert_eq!(body, json!({ "nctx": 4096 }));
    }

    #[test]
    fn a_template_without_thinking_skips_the_thinking_probe_with_its_detail() {
        let hints = TemplateHints {
            thinking: Some(false),
            ..Default::default()
        };
        assert_eq!(
            template_skip(CapabilityKey::Thinking, hints).as_deref(),
            Some("The chat template shows no sign of thinking, so the probe was not run.")
        );
        assert_eq!(template_skip(CapabilityKey::ToolCalls, hints), None);
    }

    #[test]
    fn a_template_without_tool_calls_skips_the_tool_probe() {
        let hints = TemplateHints {
            tool_calls: Some(false),
            ..Default::default()
        };
        assert_eq!(
            template_skip(CapabilityKey::ToolCalls, hints).as_deref(),
            Some("The chat template shows no sign of tool calls, so the probe was not run.")
        );
        assert_eq!(template_skip(CapabilityKey::Thinking, hints), None);
    }

    #[test]
    fn an_unknown_or_positive_hint_runs_the_probe() {
        let unknown = TemplateHints::default();
        assert_eq!(template_skip(CapabilityKey::Thinking, unknown), None);
        assert_eq!(template_skip(CapabilityKey::ToolCalls, unknown), None);
        let positive = TemplateHints {
            thinking: Some(true),
            tool_calls: Some(true),
            vision: Some(true),
            audio: Some(true),
        };
        assert_eq!(template_skip(CapabilityKey::Thinking, positive), None);
        assert_eq!(template_skip(CapabilityKey::ToolCalls, positive), None);
        assert_eq!(template_skip(CapabilityKey::Seed, unknown), None);
    }

    /// A URL that refuses connections at once: a port that was just free.
    fn refused_url() -> String {
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .and_then(|listener| listener.local_addr())
            .map(|addr| addr.port())
            .unwrap_or(9);
        format!("http://127.0.0.1:{port}/v1/chat/completions")
    }

    /// Runs the probe for `key` against a refused URL with `hints`. A `Template` verdict means no request
    /// was sent; a `NotRun` verdict means the probe sent its requests and got no answer.
    async fn key_verdict(key: CapabilityKey, hints: TemplateHints) -> Verdict {
        let client = reqwest::Client::new();
        let cancel = AtomicBool::new(false);
        let session = Session {
            client: &client,
            url: refused_url(),
            model: "org/model".to_owned(),
            load: probe_recipe(),
            hints,
            cancel: &cancel,
        };
        probe_key(&session, key).await
    }

    #[tokio::test]
    async fn a_template_without_thinking_skips_the_thinking_probe() {
        let hints = TemplateHints {
            thinking: Some(false),
            ..Default::default()
        };
        match key_verdict(CapabilityKey::Thinking, hints).await {
            Verdict::Template(detail) => assert_eq!(
                detail,
                "The chat template shows no sign of thinking, so the probe was not run."
            ),
            other => panic!("expected the template skip, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn an_unknown_thinking_hint_runs_the_probe() {
        match key_verdict(CapabilityKey::Thinking, TemplateHints::default()).await {
            Verdict::NotRun(_) => {}
            other => panic!("expected the probe to run and get no answer, got {other:?}"),
        }
    }

    #[test]
    fn a_saved_reply_shows_thinking_when_a_block_opens_closes_or_only_closes() {
        assert!(text_shows_thinking("<think>x</think>1"));
        assert!(text_shows_thinking("<think>x"));
        assert!(text_shows_thinking("Counting...</think>1 2 3"));
        assert!(text_shows_thinking("<|channel>thought\nx<channel|>1"));
        assert!(!text_shows_thinking("1 2 3"));
        assert!(!text_shows_thinking("<think>  </think>1"));
        assert!(!text_shows_thinking(
            "<|channel|>final<|message|>1 2 3<|return|>"
        ));
    }

    #[test]
    fn the_media_assets_are_bundled_and_have_their_formats() {
        assert!(!RED_PNG.is_empty());
        assert!(RED_PNG.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]));
        assert!(!ONE_TWO_THREE_WAV.is_empty());
        assert!(ONE_TWO_THREE_WAV.starts_with(b"RIFF"));
        assert_eq!(&ONE_TWO_THREE_WAV[8..12], b"WAVE");
    }

    #[test]
    fn the_image_data_url_decodes_to_the_bundled_png() {
        let url = red_image_url();
        let encoded = url
            .strip_prefix("data:image/png;base64,")
            .expect("data URL prefix");
        let bytes = STANDARD.decode(encoded).expect("valid base64");
        assert_eq!(bytes, RED_PNG);
        assert!(bytes.starts_with(&[0x89, b'P', b'N', b'G']));
    }

    #[test]
    fn the_wav_base64_decodes_to_the_bundled_wav() {
        let decoded = STANDARD
            .decode(one_two_three_base64())
            .expect("valid base64");
        assert_eq!(decoded, ONE_TWO_THREE_WAV);
    }

    #[test]
    fn vision_body_has_the_image_part_then_the_question() {
        let body = vision_body("org/model", &probe_recipe(), &json!(red_image_url()));
        assert_eq!(body["model"], "org/model");
        assert_eq!(body["stream"], false);
        assert_eq!(body["temperature"], 0.0);
        assert_eq!(body["max_tokens"], VISION_MAX_TOKENS);
        assert_eq!(body["enable_think"], false);
        assert_eq!(body["nctx"], 4096, "the recipe's load parameter");
        assert!(body.get("top_k").is_none(), "no other load parameter");

        let messages = body["messages"].as_array().expect("messages");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], "user");
        let parts = messages[0]["content"].as_array().expect("content parts");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0]["type"], "image_url");
        let url = parts[0]["image_url"]["url"].as_str().expect("image url");
        assert!(url.starts_with("data:image/png;base64,"), "{url}");
        assert_eq!(parts[1]["type"], "text");
        assert_eq!(
            parts[1]["text"],
            "What colour is this image? Answer with one word."
        );
    }

    #[test]
    fn audio_body_has_the_wav_part_then_the_question() {
        let body = audio_body("org/model", &probe_recipe(), &json!(one_two_three_base64()));
        assert_eq!(body["stream"], false);
        assert_eq!(body["temperature"], 0.0);
        assert_eq!(body["max_tokens"], AUDIO_MAX_TOKENS);
        assert_eq!(body["enable_think"], false);
        assert_eq!(body["nctx"], 4096, "the recipe's load parameter");

        let messages = body["messages"].as_array().expect("messages");
        assert_eq!(messages.len(), 1);
        let parts = messages[0]["content"].as_array().expect("content parts");
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0]["type"], "input_audio");
        assert_eq!(parts[0]["input_audio"]["format"], "wav");
        let data = parts[0]["input_audio"]["data"].as_str().expect("data");
        assert!(!data.starts_with("data:"), "raw base64, no data URL prefix");
        assert_eq!(data, one_two_three_base64());
        assert_eq!(parts[1]["type"], "text");
        assert_eq!(
            parts[1]["text"],
            "What number words do you hear? Answer briefly."
        );
    }

    #[test]
    fn vision_probe_works_when_the_reply_names_red() {
        for text in ["red", " Red\n", "It is RED."] {
            let reply = reply_with(json!({ "content": text }));
            let (status, detail) = vision_outcome(&reply);
            assert_eq!(status, CapabilityStatus::Works, "{text}");
            assert!(detail.contains("names red"), "{detail}");
        }
    }

    #[test]
    fn has_word_matches_only_whole_words_ignoring_case() {
        assert!(has_word("Red.", "red"));
        assert!(has_word("red", "red"));
        assert!(has_word("It is red.", "red"));
        assert!(has_word("3", "3"));
        assert!(has_word("Three, two", "three"));
        assert!(!has_word("scared", "red"));
        assert!(!has_word("hundred", "red"));
        assert!(!has_word("13", "3"));
        assert!(!has_word("30", "3"));
        assert!(!has_word("thirteen", "three"));
    }

    #[test]
    fn vision_probe_needs_red_as_a_whole_word() {
        for text in ["Red.", "red", "It is red."] {
            let (status, _) = vision_outcome(&reply_with(json!({ "content": text })));
            assert_eq!(status, CapabilityStatus::Works, "{text}");
        }
        for text in ["scared", "hundred"] {
            let (status, _) = vision_outcome(&reply_with(json!({ "content": text })));
            assert_eq!(status, CapabilityStatus::Accepted, "{text}");
        }
    }

    #[test]
    fn audio_probe_needs_three_or_3_as_a_whole_word() {
        for text in ["Three.", "3", "Three, two"] {
            let (status, _) = audio_outcome(&reply_with(json!({ "content": text })));
            assert_eq!(status, CapabilityStatus::Works, "{text}");
        }
        for text in ["13", "30", "thirteen"] {
            let (status, _) = audio_outcome(&reply_with(json!({ "content": text })));
            assert_eq!(status, CapabilityStatus::Accepted, "{text}");
        }
    }

    #[test]
    fn vision_probe_is_accepted_when_the_reply_does_not_name_red() {
        let reply = reply_with(json!({ "content": "Blue." }));
        let (status, detail) = vision_outcome(&reply);
        assert_eq!(status, CapabilityStatus::Accepted);
        assert_eq!(
            detail,
            "HTTP 200. The reply does not name the colour, so the image was not seen."
        );
        assert_eq!(
            vision_outcome(&reply_with(json!({ "content": null }))).0,
            CapabilityStatus::Accepted
        );
    }

    #[test]
    fn audio_probe_works_when_the_reply_names_three_or_3() {
        for text in ["three", "Three.", "3", "1, 2, 3"] {
            let reply = reply_with(json!({ "content": text }));
            let (status, detail) = audio_outcome(&reply);
            assert_eq!(status, CapabilityStatus::Works, "{text}");
            assert!(detail.contains("names three"), "{detail}");
        }
    }

    #[test]
    fn audio_probe_is_accepted_when_neither_word_is_there() {
        let reply = reply_with(json!({ "content": "one, two." }));
        let (status, detail) = audio_outcome(&reply);
        assert_eq!(status, CapabilityStatus::Accepted);
        assert_eq!(
            detail,
            "HTTP 200. The reply does not name three, so the audio was not heard."
        );
        assert_eq!(
            audio_outcome(&reply_with(json!({ "content": null }))).0,
            CapabilityStatus::Accepted
        );
    }

    #[test]
    fn a_400_or_422_on_the_media_probes_is_rejected_with_the_text() {
        let outcomes: [Outcome; 2] = [vision_outcome, audio_outcome];
        for status in [StatusCode::BAD_REQUEST, StatusCode::UNPROCESSABLE_ENTITY] {
            for outcome in outcomes {
                match verdict_for_reply(Some(classify(status, " no image part ", &[])), outcome) {
                    Verdict::Status(CapabilityStatus::Rejected, detail) => {
                        assert!(detail.starts_with(&status.as_u16().to_string()), "{detail}");
                        assert!(detail.contains("no image part"), "{detail}");
                    }
                    other => panic!("expected rejection, got {other:?}"),
                }
            }
        }
    }

    #[test]
    fn a_timeout_on_the_media_probes_is_not_run_and_a_200_maps_to_the_outcome() {
        let timeout = classify(StatusCode::REQUEST_TIMEOUT, "", &[]);
        assert!(matches!(
            verdict_for_reply(Some(timeout), vision_outcome),
            Verdict::NotRun(_)
        ));
        let ok = classify(
            StatusCode::OK,
            r#"{"choices":[{"message":{"content":"red"}}]}"#,
            &[],
        );
        assert!(matches!(
            verdict_for_reply(Some(ok), vision_outcome),
            Verdict::Status(CapabilityStatus::Works, _)
        ));
        assert!(matches!(
            verdict_for_reply(None, audio_outcome),
            Verdict::Cancelled
        ));
    }

    #[test]
    fn the_vision_gate_skips_only_when_the_summary_has_no_projector() {
        let no_projector = TemplateHints {
            vision: Some(false),
            ..Default::default()
        };
        assert_eq!(
            template_skip(CapabilityKey::Vision, no_projector).as_deref(),
            Some("No vision projector in the model folder, so the probe was not run.")
        );
        let projector = TemplateHints {
            vision: Some(true),
            ..Default::default()
        };
        assert_eq!(template_skip(CapabilityKey::Vision, projector), None);
        assert_eq!(
            template_skip(CapabilityKey::Vision, TemplateHints::default()),
            None,
            "an unknown summary runs the probe"
        );
    }

    #[test]
    fn the_audio_gate_runs_only_when_the_summary_has_an_audio_encoder() {
        for hint in [None, Some(false)] {
            let hints = TemplateHints {
                audio: hint,
                ..Default::default()
            };
            assert_eq!(
                template_skip(CapabilityKey::Audio, hints).as_deref(),
                Some("No audio encoder in the model file, so the probe was not run."),
                "{hint:?}"
            );
        }
        let encoder = TemplateHints {
            audio: Some(true),
            ..Default::default()
        };
        assert_eq!(template_skip(CapabilityKey::Audio, encoder), None);
    }

    #[test]
    fn the_media_gates_leave_the_other_keys_alone() {
        let none = TemplateHints {
            vision: Some(false),
            audio: Some(false),
            ..Default::default()
        };
        assert_eq!(template_skip(CapabilityKey::Seed, none), None);
        assert_eq!(template_skip(CapabilityKey::GrammarString, none), None);
    }

    #[tokio::test]
    async fn a_skipped_media_probe_is_a_template_verdict_with_no_request() {
        let no_projector = TemplateHints {
            vision: Some(false),
            ..Default::default()
        };
        match key_verdict(CapabilityKey::Vision, no_projector).await {
            Verdict::Template(detail) => assert_eq!(
                detail,
                "No vision projector in the model folder, so the probe was not run."
            ),
            other => panic!("expected the template skip, got {other:?}"),
        }
        match key_verdict(CapabilityKey::Audio, TemplateHints::default()).await {
            Verdict::Template(detail) => assert_eq!(
                detail,
                "No audio encoder in the model file, so the probe was not run."
            ),
            other => panic!("expected the template skip, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn a_media_probe_that_runs_and_gets_no_answer_is_not_run() {
        let with_media = TemplateHints {
            vision: Some(true),
            audio: Some(true),
            ..Default::default()
        };
        assert!(matches!(
            key_verdict(CapabilityKey::Vision, with_media).await,
            Verdict::NotRun(_)
        ));
        assert!(matches!(
            key_verdict(CapabilityKey::Audio, with_media).await,
            Verdict::NotRun(_)
        ));
    }
}
