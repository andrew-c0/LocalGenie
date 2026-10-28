//! Thinking-block detection: the marker patterns, the reply parser, and the thinking probe.

use super::*;

/// Thinking markers, shared with the chat through `src/utils/thinking.ts`.
pub(super) const THINKING_PATTERNS_JSON: &str =
    include_str!("../../../../shared/thinking-patterns.json");

/// One open and close pair. The JSON's `name` and `note` are for people, so they are not read here.
#[derive(Debug, Deserialize)]
pub(super) struct Pattern {
    pub(super) open: String,
    pub(super) close: String,
}

/// A marker removed from the answer. It never counts as thinking.
#[derive(Debug, Deserialize)]
pub(super) struct StripMarker {
    pub(super) text: String,
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct ThinkingPatterns {
    #[serde(default)]
    pub(super) patterns: Vec<Pattern>,
    #[serde(default, rename = "stripOnly")]
    pub(super) strip_only: Vec<StripMarker>,
}

/// The patterns from the shared JSON. An empty tag would match everywhere, so such entries are
/// dropped. A file that does not parse gives no patterns; `shared_thinking_files_parse` catches that.
pub(super) fn thinking_patterns() -> &'static ThinkingPatterns {
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
pub(super) struct ParsedReply {
    /// Reasoning text from every thinking block, trimmed. Empty blocks are left out.
    pub(super) thinking: String,
    /// The answer with thinking blocks and strip-only markers removed, trimmed.
    #[allow(dead_code)] // Read by the shared-case test; the scan itself needs only `thinking`.
    pub(super) answer: String,
    /// True while a block has been opened but not closed yet (still streaming).
    #[allow(dead_code)] // Read by the shared-case test; the scan itself needs only `thinking`.
    pub(super) thinking_open: bool,
}

/// Every tag the parser reads: open and close tags, and strip-only markers.
pub(super) fn all_tags(p: &ThinkingPatterns) -> impl Iterator<Item = &str> {
    p.patterns
        .iter()
        .flat_map(|pat| [pat.open.as_str(), pat.close.as_str()])
        .chain(p.strip_only.iter().map(|m| m.text.as_str()))
}

/// Length of the longest suffix of `text` that is a proper prefix of a tag. It is held back, since
/// it may be the start of a tag that is still streaming.
pub(super) fn held_back_len(text: &str, p: &ThinkingPatterns) -> usize {
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
pub(super) fn next_marker<'a>(
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
pub(super) fn implicit_close(text: &str, p: &ThinkingPatterns) -> Option<(usize, usize)> {
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
pub(super) fn parse_thinking(text: &str) -> ParsedReply {
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
pub(super) enum ThinkingSeen {
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
pub(super) fn thinking_seen(reply: &Value) -> ThinkingSeen {
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
pub(super) fn shows_thinking(reply: &Value) -> bool {
    thinking_seen(reply) != ThinkingSeen::None
}

/// True when a saved chat reply's text shows a think block, closed or still open. The same parse as
/// `thinking_seen`. A saved message keeps no `reasoning_content`, so only the text is read.
pub(super) fn text_shows_thinking(content: &str) -> bool {
    let parsed = parse_thinking(content);
    parsed.thinking_open || !parsed.thinking.is_empty()
}

/// True when a streamed thinking reply has closed its block, so the rest need not be read. The
/// content holds a closing tag of some pattern and no block is still open after it. Reasoning
/// that has been followed by answer text has also ended.
pub(super) fn thinking_closed(content: &str, reasoning: &str) -> bool {
    let has_close = thinking_patterns()
        .patterns
        .iter()
        .any(|pattern| content.contains(pattern.close.as_str()));
    (has_close && !parse_thinking(content).thinking_open)
        || (!reasoning.trim().is_empty() && !content.trim().is_empty())
}

/// True when the reply stopped on the token limit (`finish_reason` `length`).
pub(super) fn hit_cap(reply: &Value) -> bool {
    finish_reason(reply) == Some("length")
}

/// Detail for a thinking-on reply that opened a block (a tag, or reasoning text with no answer after
/// it) and did not close it. A reply that hit the cap says so; otherwise the reply ended first.
pub(super) fn open_detail(on: &Value, off_shows: bool) -> String {
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
pub(super) fn thinking_outcome(on: &Value, off: &Value) -> (CapabilityStatus, String) {
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

/// Body of one thinking-probe request. Both requests send `THINKING_PROMPT` at temperature 0, so only
/// the switch differs. The thinking-on request streams and has the larger cap; the thinking-off
/// request is a plain request with the short cap. With `think_token`, the thinking-on request also
/// carries the think token, which a template such as Gemma 4's reads instead of `enable_think`.
pub(super) fn thinking_body(
    model: &str,
    load: &ModelLoadParams,
    think: bool,
    think_token: bool,
) -> Value {
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
pub(super) async fn probe_thinking(session: &Session<'_>) -> Verdict {
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
