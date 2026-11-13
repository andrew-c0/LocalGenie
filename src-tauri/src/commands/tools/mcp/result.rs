//! Turns an MCP tool result into the text the model reads. Text parts are joined with new lines.
//! Other parts become a short note, because images and files from tools are not sent to the model.
//! A result the server marks as an error is a failed tool call.

use rmcp::model::{CallToolResult, ContentBlock};

use super::super::output::capped_output;
use super::super::ToolOutput;

const NO_TEXT: &str = "The tool returned no text.";
const ERROR_WITHOUT_TEXT: &str = "The tool reported an error without a message.";

/// The tool output for a result, capped like the native tools. A result marked as an error is
/// `Err` with its text.
pub fn outcome_of(result: &CallToolResult) -> Result<ToolOutput, String> {
    let is_error = result.is_error.unwrap_or(false);
    let text = text_of(&result.content);
    let text = if !text.is_empty() {
        text
    } else if is_error {
        ERROR_WITHOUT_TEXT.to_string()
    } else {
        NO_TEXT.to_string()
    };
    let capped = capped_output(&text, false);
    if is_error {
        Err(capped.content)
    } else {
        Ok(capped)
    }
}

/// The text of the parts: text parts as they are, other parts as a note, empty parts left out.
pub fn text_of(parts: &[ContentBlock]) -> String {
    parts
        .iter()
        .map(part_text)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn part_text(part: &ContentBlock) -> String {
    match part {
        ContentBlock::Text(text) => text.text.clone(),
        ContentBlock::Image(_) => "[image omitted]".into(),
        ContentBlock::Audio(_) => "[audio omitted]".into(),
        ContentBlock::Resource(_) => "[resource omitted]".into(),
        ContentBlock::ResourceLink(_) => "[resource link omitted]".into(),
        _ => "[content omitted]".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image_part() -> ContentBlock {
        ContentBlock::image("iVBORw0KGgo=", "image/png")
    }

    #[test]
    fn text_parts_are_joined_with_new_lines() {
        let result = CallToolResult::success(vec![
            ContentBlock::text("first"),
            ContentBlock::text(""),
            ContentBlock::text("second"),
        ]);
        let output = outcome_of(&result).expect("success");
        assert_eq!(output.content, "first\nsecond");
        assert!(!output.truncated);
        assert!(output.attachment.is_none());
    }

    #[test]
    fn an_image_becomes_a_note() {
        let result = CallToolResult::success(vec![ContentBlock::text("caption"), image_part()]);
        let output = outcome_of(&result).expect("success");
        assert_eq!(output.content, "caption\n[image omitted]");
    }

    #[test]
    fn audio_and_other_parts_are_noted_too() {
        let audio = ContentBlock::audio("AAAA", "audio/wav");
        assert_eq!(part_text(&audio), "[audio omitted]");
    }

    #[test]
    fn an_error_result_is_a_failed_call_with_its_text() {
        let result = CallToolResult::error(vec![ContentBlock::text("disk full")]);
        assert_eq!(outcome_of(&result), Err("disk full".to_string()));
    }

    #[test]
    fn an_error_result_without_text_says_so() {
        let result = CallToolResult::error(vec![image_part()]);
        assert_eq!(outcome_of(&result), Err("[image omitted]".to_string()));
        let empty = CallToolResult::error(Vec::new());
        assert_eq!(outcome_of(&empty), Err(ERROR_WITHOUT_TEXT.to_string()));
    }

    #[test]
    fn an_empty_success_says_it_has_no_text() {
        let result = CallToolResult::success(Vec::new());
        let output = outcome_of(&result).expect("success");
        assert_eq!(output.content, NO_TEXT);
    }

    #[test]
    fn a_long_text_is_capped_like_the_native_tools() {
        let long = "x".repeat(crate::commands::tools::limits::CONTENT_MAX_CHARS + 10);
        let result = CallToolResult::success(vec![ContentBlock::text(long)]);
        let output = outcome_of(&result).expect("success");
        assert!(output.truncated);
        assert!(output.content.contains("[truncated: showing"));
    }
}
