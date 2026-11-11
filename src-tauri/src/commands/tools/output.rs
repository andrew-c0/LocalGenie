//! The cap on tool output the model reads. File and web tools share it, so the truncation note is the same.
use super::limits::CONTENT_MAX_CHARS;
use super::ToolOutput;

/// Cap `text` at `CONTENT_MAX_CHARS` characters. A cut is marked with a final line that gives the
/// full character count. `already_cut` marks output that was shortened before this call.
pub(super) fn capped_output(text: &str, already_cut: bool) -> ToolOutput {
    let total = text.chars().count();
    if total <= CONTENT_MAX_CHARS {
        return ToolOutput {
            content: text.to_string(),
            truncated: already_cut,
            attachment: None,
        };
    }
    let cut_at = text
        .char_indices()
        .nth(CONTENT_MAX_CHARS)
        .map_or(text.len(), |(index, _)| index);
    ToolOutput {
        content: format!(
            "{}\n[truncated: showing {CONTENT_MAX_CHARS} of {total} characters]",
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
    use super::{capped_output, shorten_chars};
    use crate::commands::tools::limits::CONTENT_MAX_CHARS;

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
        let output = capped_output(&long, false);
        assert!(output.truncated);
        assert!(output.content.ends_with(&format!(
            "[truncated: showing {CONTENT_MAX_CHARS} of {} characters]",
            CONTENT_MAX_CHARS + 1
        )));
    }
}
