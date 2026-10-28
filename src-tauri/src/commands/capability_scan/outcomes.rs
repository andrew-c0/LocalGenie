//! Turns a probe reply into a capability status and a detail line (grammar, tool calls, vision, audio).

use super::*;

/// Outcome of the grammar probe from its reply. `works` when the reply, trimmed, is exactly one of
/// the words the grammar allows. Any other 200 reply is `accepted`: the grammar was not seen to bite.
pub(super) fn grammar_outcome(reply: &Value) -> (CapabilityStatus, String) {
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
pub(super) fn tool_call_count(reply: &Value) -> usize {
    reply["choices"][0]["message"]["tool_calls"]
        .as_array()
        .map_or(0, Vec::len)
}

/// True when `word` occurs in `text` as a whole word, ignoring ASCII case. A word is a run of ASCII
/// letters and digits, so `red` is not in `scared` or `hundred`, and `3` is not in `13` or `30`.
pub(super) fn has_word(text: &str, word: &str) -> bool {
    text.split(|c: char| !c.is_ascii_alphanumeric())
        .any(|part| part.eq_ignore_ascii_case(word))
}

/// Outcome of the vision probe. `works` when the trimmed reply has "red" as a whole word, ignoring
/// case. Any other 200 reply is `accepted`: the image was not seen.
pub(super) fn vision_outcome(reply: &Value) -> (CapabilityStatus, String) {
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
pub(super) fn audio_outcome(reply: &Value) -> (CapabilityStatus, String) {
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
pub(super) type Outcome = fn(&Value) -> (CapabilityStatus, String);

/// The verdict for one probe reply. `outcome` reads a 200 reply. A rejection is `rejected` with the
/// server's text, and an inconclusive reply is not run. `None` is a cancelled request.
pub(super) fn verdict_for_reply(reply: Option<Reply>, outcome: Outcome) -> Verdict {
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
