//! The cap on tool output the model reads. File, web and MCP tools share it, so the truncation note
//! is the same. The size is a budget per call: `result_max_chars`, clamped, or the default.
use super::limits::{CONTENT_MAX_CHARS, RESULT_MAX_CHARS_MAX, RESULT_MAX_CHARS_MIN};
use super::ToolOutput;

/// The character budget of one call: the requested size clamped to the allowed range, or the
/// default when none is given.
pub(super) fn result_budget(requested: Option<usize>) -> usize {
    requested.map_or(CONTENT_MAX_CHARS, |chars| {
        chars.clamp(RESULT_MAX_CHARS_MIN, RESULT_MAX_CHARS_MAX)
    })
}

/// Cap `text` at `max_chars` characters. A cut is marked with a final line that gives the full
/// character count. `already_cut` marks output that was shortened before this call.
pub(super) fn capped_output(text: &str, max_chars: usize, already_cut: bool) -> ToolOutput {
    let total = text.chars().count();
    if total <= max_chars {
        return ToolOutput {
            content: text.to_string(),
            truncated: already_cut,
            attachment: None,
        };
    }
    let cut_at = text
        .char_indices()
        .nth(max_chars)
        .map_or(text.len(), |(index, _)| index);
    ToolOutput {
        content: format!(
            "{}\n[truncated: showing {max_chars} of {total} characters]",
            &text[..cut_at]
        ),
        truncated: true,
        attachment: None,
    }
}

/// `text` cut to at most `max` characters. A cut ends with "..." inside that limit.
pub(super) fn shorten_chars(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        return text.to_string();
    }
    let kept: String = text.chars().take(max.saturating_sub(3)).collect();
    format!("{kept}...")
}

#[cfg(test)]
mod tests {
    use super::{capped_output, result_budget, shorten_chars};
    use crate::commands::tools::limits::{
        CONTENT_MAX_CHARS, RESULT_MAX_CHARS_MAX, RESULT_MAX_CHARS_MIN,
    };

    #[test]
    fn shorten_keeps_short_text_and_marks_a_cut_within_the_limit() {
        assert_eq!(shorten_chars("short", 10), "short");
        let cut = shorten_chars(&"é".repeat(20), 10);
        assert_eq!(cut.chars().count(), 10);
        assert!(cut.ends_with("..."));
    }

    #[test]
    fn capped_output_marks_a_cut_with_the_count() {
        let long = "x".repeat(CONTENT_MAX_CHARS + 1);
        let output = capped_output(&long, CONTENT_MAX_CHARS, false);
        assert!(output.truncated);
        assert!(output.content.ends_with(&format!(
            "[truncated: showing {CONTENT_MAX_CHARS} of {} characters]",
            CONTENT_MAX_CHARS + 1
        )));
    }

    #[test]
    fn capped_output_with_a_custom_limit_cuts_there_and_names_it() {
        let long = "y".repeat(1500);
        let output = capped_output(&long, 1200, false);
        assert!(output.truncated);
        let note = "\n[truncated: showing 1200 of 1500 characters]";
        let body = output.content.strip_suffix(note).expect("final note");
        assert_eq!(body.chars().count(), 1200);
    }

    #[test]
    fn capped_output_under_a_custom_limit_is_whole() {
        let output = capped_output(&"z".repeat(900), 1000, false);
        assert_eq!(output.content.chars().count(), 900);
        assert!(!output.truncated);
        let already = capped_output("short", 1000, true);
        assert_eq!(already.content, "short");
        assert!(already.truncated);
    }

    #[test]
    fn no_budget_is_the_default_and_the_clamp_holds_the_range() {
        assert_eq!(result_budget(None), CONTENT_MAX_CHARS);
        assert_eq!(result_budget(Some(0)), RESULT_MAX_CHARS_MIN);
        assert_eq!(result_budget(Some(999)), RESULT_MAX_CHARS_MIN);
        assert_eq!(result_budget(Some(1000)), 1000);
        assert_eq!(result_budget(Some(4096)), 4096);
        assert_eq!(result_budget(Some(40_000)), RESULT_MAX_CHARS_MAX);
        assert_eq!(result_budget(Some(40_001)), RESULT_MAX_CHARS_MAX);
        assert_eq!(result_budget(Some(usize::MAX)), RESULT_MAX_CHARS_MAX);
    }
}
