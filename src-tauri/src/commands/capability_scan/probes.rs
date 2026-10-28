//! Probe definitions: the prompts, token limits, probe images and audio, and the request each probe sends.

use super::*;

/// Prompt for every probe except the thinking and grammar probes. Long enough to run past a small
/// `max_tokens`.
pub(super) const PROMPT: &str = "Count from one to twenty, separated by spaces.";

/// Prompt for the thinking probe. Counting does not make Gemma 4 think, so this one asks a question
/// that needs reasoning. Both thinking requests send it, so only the switch differs.
pub(super) const THINKING_PROMPT: &str = "Is 221 a prime number? Explain briefly.";

/// `max_tokens` for every probe that does not test it.
pub(super) const BASE_MAX_TOKENS: u64 = 32;

/// `max_tokens` for the thinking-off request of the thinking probe. Enough for a short reply.
pub(super) const THINK_MAX_TOKENS: u64 = 200;

/// Hard cap for the thinking-on request. The stream is dropped as soon as the think block closes,
/// so the cap only matters for a model that never closes it.
pub(super) const THINK_STREAM_MAX_TOKENS: u64 = 1024;

/// `max_tokens` for the tool-call probe. A tool call is short, so this is ample.
pub(super) const TOOL_MAX_TOKENS: u64 = 100;

/// Prompt for the tool-call probe. It only makes sense with the `get_weather` tool offered.
pub(super) const TOOL_PROMPT: &str = "What is the weather in Paris? Use the tool.";

/// Grammar for the grammar probe: the reply may only be `yes` or `no`.
pub(super) const GRAMMAR_YES_NO: &str = "root ::= \"yes\" | \"no\"";

/// Prompt for the grammar probe. Its answer is one of the two words the grammar allows.
pub(super) const GRAMMAR_PROMPT: &str = "Is the sky blue? Answer yes or no.";

/// `max_tokens` for the grammar probe. Both allowed words are shorter than this.
pub(super) const GRAMMAR_MAX_TOKENS: u64 = 8;

/// 96x96 solid red PNG, sent by the vision probe. Bundled, so the probe never reads the disk.
pub(super) const RED_PNG: &[u8] = include_bytes!("../../../probe-assets/red-96.png");

/// Spoken "one, two, three": 22050 Hz mono 16-bit WAV, sent by the audio probe. Bundled as above.
pub(super) const ONE_TWO_THREE_WAV: &[u8] =
    include_bytes!("../../../probe-assets/one-two-three.wav");

/// Prompt for the vision probe, sent with `RED_PNG`.
pub(super) const VISION_PROMPT: &str = "What colour is this image? Answer with one word.";

/// `max_tokens` for the vision probe. A one-word answer is short.
pub(super) const VISION_MAX_TOKENS: u64 = 16;

/// Prompt for the audio probe, sent with `ONE_TWO_THREE_WAV`.
pub(super) const AUDIO_PROMPT: &str = "What number words do you hear? Answer briefly.";

/// `max_tokens` for the audio probe. A short list of number words is ample.
pub(super) const AUDIO_MAX_TOKENS: u64 = 16;

/// Context window for every probe. It is GenieX's default (`--nctx`, 4096), and it leaves room for a
/// 1024-token thinking reply plus the prompt.
pub(super) const RECIPE_NCTX: i32 = 4096;

/// The load parameters every probe sends, and no others: the server uses its own defaults for the
/// rest. The probes never use the saved settings, so a result does not depend on how the user set
/// the model up. The server reloads a model when its load parameters change, so a model loaded with
/// another context window is reloaded by the scan.
pub(super) fn probe_recipe() -> ModelLoadParams {
    ModelLoadParams {
        nctx: Some(RECIPE_NCTX),
        ..Default::default()
    }
}

/// How a probe's effect is checked, beyond the server answering 200.
#[derive(Debug, Clone, Copy)]
pub(super) enum Check {
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
pub(super) fn weather_tool() -> Value {
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
pub(super) fn red_image_url() -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(RED_PNG))
}

/// The WAV as base64, the `data` of an `input_audio` content part.
pub(super) fn one_two_three_base64() -> String {
    STANDARD.encode(ONE_TWO_THREE_WAV)
}

/// The field under test for a key: the server's field name, a non-default value, and its check.
/// For `Thinking` the field is `enable_think` set on; the probe also sends it off. For `ToolCalls`
/// and `GrammarString` the value is the tool list and the grammar text. For `Vision` and `Audio` the
/// value is the image data URL and the WAV's base64, which go into the message content parts.
pub(super) fn probe_for(key: CapabilityKey) -> (&'static str, Value, Check) {
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

/// The hints from the capability summary. `None` is unknown (the summary could not be read).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(super) struct TemplateHints {
    /// From the chat template.
    pub(super) thinking: Option<bool>,
    /// From the chat template.
    pub(super) tool_calls: Option<bool>,
    /// `hasVisionProjector` from the summary. Unknown runs the probe.
    pub(super) vision: Option<bool>,
    /// `hasAudioEncoder` from the summary. Only `Some(true)` runs the probe.
    pub(super) audio: Option<bool>,
}

/// Why a probe is skipped, from the hints. `None` runs the probe.
///
/// - Thinking and tool calls: a chat template with hint `false` shows no sign of the feature. An
///   unknown hint runs the probe.
/// - Vision: the summary has no vision projector. An unknown summary runs the probe.
/// - Audio: the summary does not say the audio encoder is there. Anything but `true` skips it.
pub(super) fn template_skip(key: CapabilityKey, hints: TemplateHints) -> Option<String> {
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

/// Grammar probe: one question whose answer the grammar limits to `yes` or `no`, with a short cap.
pub(super) async fn probe_grammar(session: &Session<'_>, grammar: Value) -> Verdict {
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
pub(super) async fn probe_tool_calls(session: &Session<'_>, tools: Value) -> Verdict {
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
pub(super) fn vision_body(model: &str, load: &ModelLoadParams, image_url: &Value) -> Value {
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
pub(super) fn audio_body(model: &str, load: &ModelLoadParams, wav_base64: &Value) -> Value {
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

/// Vision probe: the red image with a question about its colour. A 400 or 422 rejects it; any other
/// failure is inconclusive.
pub(super) async fn probe_vision(session: &Session<'_>, image_url: &Value) -> Verdict {
    let body = vision_body(&session.model, &session.load, image_url);
    verdict_for_reply(send(session, &body, &[]).await, vision_outcome)
}

/// Audio probe: the spoken "one, two, three" with a question about the number words. Rejection and
/// inconclusive replies are as for the vision probe.
pub(super) async fn probe_audio(session: &Session<'_>, wav_base64: &Value) -> Verdict {
    let body = audio_body(&session.model, &session.load, wav_base64);
    verdict_for_reply(send(session, &body, &[]).await, audio_outcome)
}

/// Probes one key and returns its verdict.
pub(super) async fn probe_key(session: &Session<'_>, key: CapabilityKey) -> Verdict {
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
