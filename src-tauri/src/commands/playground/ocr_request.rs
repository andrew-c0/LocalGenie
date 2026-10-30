//! The request of an OCR run and the chat completion it sends to the GenieX server: validation of
//! the webview's choices, the request body, and reading the text out of the reply.

use serde::Deserialize;

use super::ocr_catalog::OcrMode;
use super::ocr_table;
use crate::commands::chat_helpers::{apply_load_params, ModelLoadParams};
use crate::commands::constants::DEFAULT_PORT;

/// Longest side of the picture, in pixels. A larger picture makes the vision encoder run for
/// minutes and exhaust memory.
pub(super) const MAX_SIDE_PIXELS: u32 = 2500;
/// Tokens the model may write. A page of text fits well within it.
pub(super) const MAX_TOKENS: u32 = 2048;

/// Where the language model runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Compute {
    Cpu,
    Gpu,
    Npu,
    /// The UI's Auto choice: no `compute` field, so GenieX uses its default.
    Auto,
}

impl Compute {
    /// The value of the server's `compute` field. None for Auto, which leaves the field out.
    fn server_value(self) -> Option<&'static str> {
        match self {
            Self::Cpu => Some("cpu"),
            Self::Gpu => Some("gpu"),
            Self::Npu => Some("npu"),
            Self::Auto => None,
        }
    }
}

/// Where the vision encoder runs. The GPU is not offered: the encoder fails to load on it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VisionCompute {
    Cpu,
    Npu,
}

impl VisionCompute {
    /// The value of the server's `vit_compute` field: the device names the vision encoder accepts.
    fn server_value(self) -> &'static str {
        match self {
            Self::Cpu => "CPU",
            Self::Npu => "HTP0",
        }
    }
}

/// `playground_ocr_run`'s request, as the webview sends it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrRequest {
    pub job_id: String,
    pub model_id: String,
    pub image_path: String,
    pub mode: OcrMode,
    pub compute: Compute,
    pub vision_compute: VisionCompute,
    /// The port of the GenieX server. The default port when not given.
    pub port: Option<u16>,
}

/// The base URL of the GenieX server on `port`.
pub(super) fn base_url(port: Option<u16>) -> String {
    format!("http://127.0.0.1:{}", port.unwrap_or(DEFAULT_PORT))
}

/// Refuses a picture whose longest side is over the cap.
pub(super) fn check_image_size(width: u32, height: u32) -> Result<(), String> {
    let longest = width.max(height);
    if longest > MAX_SIDE_PIXELS {
        Err(format!(
            "The picture is {width} x {height} px. Use one with at most {MAX_SIDE_PIXELS} px on its longest side."
        ))
    } else {
        Ok(())
    }
}

/// What the request body is made of.
#[derive(Debug, Clone, Copy)]
pub(super) struct BodyParts<'a> {
    /// The model's name in GenieX.
    pub model: &'a str,
    pub prompt: &'a str,
    /// The picture as a `data:` URL.
    pub image_url: &'a str,
    pub compute: Compute,
    pub vision_compute: VisionCompute,
}

/// The JSON body of the non-streamed chat completion: the picture, then the prompt, with greedy
/// sampling and the compute choices the server reads per request.
pub(super) fn build_body(parts: BodyParts<'_>) -> serde_json::Value {
    let mut body = serde_json::json!({
        "model": parts.model,
        "messages": [{
            "role": "user",
            "content": [
                { "type": "image_url", "image_url": { "url": parts.image_url } },
                { "type": "text", "text": parts.prompt },
            ],
        }],
        "stream": false,
        "max_tokens": MAX_TOKENS,
        "temperature": 0,
    });
    apply_load_params(
        &mut body,
        &ModelLoadParams {
            compute: parts.compute.server_value().map(str::to_string),
            ..ModelLoadParams::default()
        },
    );
    body["vit_compute"] = serde_json::json!(parts.vision_compute.server_value());
    body
}

/// The reply's text, or the server's error message when it sent one.
pub(super) fn reply_text(body: &serde_json::Value) -> Result<String, String> {
    if let Some(message) = body["error"]["message"].as_str() {
        return Err(message.to_string());
    }
    body["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "The server sent no text.".to_string())
}

/// Remove the model's thinking from `text`: closed `<think>` blocks, a lone closing tag and what
/// comes before it, and a block that never closed.
pub(super) fn strip_think(text: &str) -> String {
    const OPEN: &str = "<think>";
    const CLOSE: &str = "</think>";
    let mut rest = text.to_string();
    while let Some(start) = rest.find(OPEN) {
        let Some(length) = rest[start..].find(CLOSE) else {
            break;
        };
        rest.replace_range(start..start + length + CLOSE.len(), "");
    }
    if let Some(end) = rest.rfind(CLOSE) {
        rest = rest[end + CLOSE.len()..].to_string();
    }
    if let Some(start) = rest.find(OPEN) {
        rest.truncate(start);
    }
    rest
}

/// The text the webview shows for a reply: thinking removed, trimmed, and a table converted to
/// markdown.
pub(super) fn finish_text(mode: OcrMode, reply: &str) -> String {
    let text = strip_think(reply);
    match mode {
        OcrMode::Text => text.trim().to_string(),
        OcrMode::Table => ocr_table::table_to_markdown(&text),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parts() -> BodyParts<'static> {
        BodyParts {
            model: "PaddlePaddle/PaddleOCR-VL-1.6-GGUF",
            prompt: "OCR:",
            image_url: "data:image/png;base64,AAAA",
            compute: Compute::Cpu,
            vision_compute: VisionCompute::Npu,
        }
    }

    #[test]
    fn the_body_has_the_picture_the_prompt_and_greedy_sampling() {
        let body = build_body(parts());
        assert_eq!(body["model"], "PaddlePaddle/PaddleOCR-VL-1.6-GGUF");
        assert_eq!(body["stream"], false);
        assert_eq!(body["max_tokens"], 2048);
        assert_eq!(body["temperature"], 0);
        let content = &body["messages"][0]["content"];
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(content[0]["type"], "image_url");
        assert_eq!(content[0]["image_url"]["url"], "data:image/png;base64,AAAA");
        assert_eq!(
            content[1],
            serde_json::json!({"type": "text", "text": "OCR:"})
        );
    }

    #[test]
    fn the_body_maps_the_compute_choices_to_the_server_values() {
        let body = build_body(parts());
        assert_eq!(body["compute"], "cpu");
        assert_eq!(body["vit_compute"], "HTP0");

        let body = build_body(BodyParts {
            compute: Compute::Npu,
            vision_compute: VisionCompute::Cpu,
            ..parts()
        });
        assert_eq!(body["compute"], "npu");
        assert_eq!(body["vit_compute"], "CPU");

        let body = build_body(BodyParts {
            compute: Compute::Gpu,
            ..parts()
        });
        assert_eq!(body["compute"], "gpu");

        let body = build_body(BodyParts {
            compute: Compute::Auto,
            ..parts()
        });
        assert!(body.get("compute").is_none(), "auto leaves the field out");
        assert_eq!(body["vit_compute"], "HTP0");
    }

    #[test]
    fn the_size_cap_is_2500_px_on_the_longest_side_inclusive() {
        assert!(check_image_size(2500, 100).is_ok());
        assert!(check_image_size(100, 2500).is_ok());
        let error = check_image_size(2501, 100).expect_err("too wide");
        assert!(
            error.contains("2501 x 100") && error.contains("2500"),
            "{error}"
        );
        assert!(check_image_size(10, 4000).is_err());
    }

    #[test]
    fn request_json_uses_the_frontend_names() {
        let request: OcrRequest = serde_json::from_value(serde_json::json!({
            "jobId": "job-1",
            "modelId": "paddleocr-vl-1-6",
            "imagePath": "C:\\pics\\page.png",
            "mode": "table",
            "compute": "npu",
            "visionCompute": "cpu",
            "port": 18182,
        }))
        .expect("request");
        assert_eq!(request.job_id, "job-1");
        assert_eq!(request.mode, OcrMode::Table);
        assert_eq!(request.compute, Compute::Npu);
        assert_eq!(request.vision_compute, VisionCompute::Cpu);
        assert_eq!(request.port, Some(18182));
    }

    #[test]
    fn the_port_is_optional_and_unknown_choices_are_refused() {
        let ok = serde_json::json!({
            "jobId": "j", "modelId": "m", "imagePath": "p",
            "mode": "text", "compute": "auto", "visionCompute": "npu",
        });
        let request: OcrRequest = serde_json::from_value(ok.clone()).expect("request");
        assert_eq!(request.port, None);
        assert_eq!(base_url(request.port), "http://127.0.0.1:18181");
        assert_eq!(base_url(Some(9000)), "http://127.0.0.1:9000");

        for (field, value) in [
            ("mode", "layout"),
            ("compute", "hybrid"),
            ("visionCompute", "gpu"),
        ] {
            let mut bad = ok.clone();
            bad[field] = serde_json::json!(value);
            assert!(
                serde_json::from_value::<OcrRequest>(bad).is_err(),
                "{field}"
            );
        }
    }

    #[test]
    fn the_text_comes_from_the_first_choice_or_the_error() {
        let ok = serde_json::json!({"choices": [{"message": {"content": "hello"}}]});
        assert_eq!(reply_text(&ok), Ok("hello".to_string()));
        let failed = serde_json::json!({"error": {"message": "model not found"}});
        assert_eq!(reply_text(&failed), Err("model not found".to_string()));
        assert!(reply_text(&serde_json::json!({})).is_err());
        assert!(reply_text(&serde_json::json!({"choices": []})).is_err());
    }

    #[test]
    fn thinking_is_removed() {
        assert_eq!(strip_think("<think>hmm</think>Hello"), "Hello");
        assert_eq!(strip_think("a<think>x</think>b<think>y</think>c"), "abc");
        assert_eq!(strip_think("hmm</think>Hello"), "Hello");
        assert_eq!(strip_think("Hello<think>never ends"), "Hello");
        assert_eq!(strip_think("no thinking"), "no thinking");
    }

    #[test]
    fn text_mode_trims_and_table_mode_converts() {
        assert_eq!(
            finish_text(OcrMode::Text, "<think>x</think>\n Line one\nLine two \n"),
            "Line one\nLine two"
        );
        assert_eq!(
            finish_text(OcrMode::Table, "<fcel>A<fcel>B<nl><fcel>1<fcel>2<nl>"),
            "| A | B |\n| --- | --- |\n| 1 | 2 |"
        );
        assert_eq!(finish_text(OcrMode::Table, " plain "), "plain");
    }
}
