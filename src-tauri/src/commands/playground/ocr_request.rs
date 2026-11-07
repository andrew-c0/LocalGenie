//! The request of an OCR run and the chat completion it sends to the GenieX server: validation of
//! the webview's choices, the request body, and reading the text out of the reply.

use serde::Deserialize;

use super::ocr_catalog::{OcrMode, TableFormat};
use super::ocr_table;
use crate::commands::chat_helpers::{apply_load_params, strip_think, ModelLoadParams};
use crate::commands::constants::DEFAULT_PORT;

/// Longest side of the picture, in pixels. A larger picture makes the vision encoder run for
/// minutes and exhaust memory.
pub(super) const MAX_SIDE_PIXELS: u32 = 2500;

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
    /// The most tokens the model may write (`max_tokens`).
    pub max_tokens: u32,
    /// The context window (`nctx`), the same for every request of the model.
    pub context_tokens: u32,
    pub compute: Compute,
    pub vision_compute: VisionCompute,
}

/// The JSON body of the non-streamed chat completion: the picture, then the prompt, with greedy
/// sampling, the output cap, and the context window and compute choices the server reads per request.
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
        "max_tokens": parts.max_tokens,
        "temperature": 0,
    });
    apply_load_params(
        &mut body,
        &ModelLoadParams {
            // A window over i32::MAX cannot be a real context; the recipes' values are far below it.
            nctx: Some(i32::try_from(parts.context_tokens).unwrap_or(i32::MAX)),
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

/// The text the webview shows for a reply: thinking removed and trimmed. Tables become markdown
/// tables: PaddleOCR's tags in Table mode, and HTML tables in either mode for the models that write
/// HTML (GLM-OCR, Qwen3-VL, DeepSeek-OCR), which may write one in a text page. Everything else is
/// shown as the model wrote it.
pub(super) fn finish_text(mode: OcrMode, table_format: TableFormat, reply: &str) -> String {
    let text = strip_think(reply);
    match (mode, table_format) {
        (OcrMode::Table, TableFormat::PaddleTags) => ocr_table::table_to_markdown(&text),
        (_, TableFormat::HtmlOrMarkdown) => ocr_table::html_tables_to_markdown(&text),
        (OcrMode::Text, _) | (OcrMode::Table, TableFormat::AsIs) => text.trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::super::ocr_catalog::{find_recipe, RECIPES};
    use super::*;

    fn parts() -> BodyParts<'static> {
        BodyParts {
            model: "PaddlePaddle/PaddleOCR-VL-1.6-GGUF",
            prompt: "OCR:",
            image_url: "data:image/png;base64,AAAA",
            max_tokens: 4096,
            context_tokens: 8192,
            compute: Compute::Cpu,
            vision_compute: VisionCompute::Npu,
        }
    }

    /// The body parts of a curated model, with its own output cap and window.
    fn parts_of(id: &str) -> BodyParts<'static> {
        let recipe = find_recipe(id).expect("recipe");
        BodyParts {
            model: recipe.repo,
            prompt: "OCR:",
            image_url: "data:image/png;base64,AAAA",
            max_tokens: recipe.max_tokens,
            context_tokens: recipe.context_tokens,
            compute: Compute::Auto,
            vision_compute: VisionCompute::Cpu,
        }
    }

    #[test]
    fn the_body_has_the_picture_the_prompt_and_greedy_sampling() {
        let body = build_body(parts());
        assert_eq!(body["model"], "PaddlePaddle/PaddleOCR-VL-1.6-GGUF");
        assert_eq!(body["stream"], false);
        assert_eq!(body["max_tokens"], 4096);
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
    fn the_body_carries_the_window_as_nctx_and_the_output_cap() {
        let body = build_body(parts());
        assert_eq!(body["nctx"], 8192);
        assert_eq!(body["max_tokens"], 4096);

        let glm = build_body(parts_of("glm-ocr"));
        assert_eq!(glm["nctx"], 16384);
        assert_eq!(glm["max_tokens"], 8192);
        assert_eq!(glm["model"], "ggml-org/GLM-OCR-GGUF");
    }

    #[test]
    fn every_request_of_a_model_sends_the_same_window() {
        for recipe in RECIPES {
            let first = build_body(parts_of(recipe.id));
            let second = build_body(BodyParts {
                compute: Compute::Npu,
                vision_compute: VisionCompute::Npu,
                prompt: "Table Recognition:",
                ..parts_of(recipe.id)
            });
            assert_eq!(first["nctx"], second["nctx"], "{}", recipe.id);
            assert_eq!(first["nctx"], recipe.context_tokens, "{}", recipe.id);
        }
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
    fn text_mode_trims_and_table_mode_converts() {
        assert_eq!(
            finish_text(
                OcrMode::Text,
                TableFormat::AsIs,
                "<think>x</think>\n Line one\nLine two \n"
            ),
            "Line one\nLine two"
        );
        assert_eq!(
            finish_text(
                OcrMode::Table,
                TableFormat::PaddleTags,
                "<fcel>A<fcel>B<nl><fcel>1<fcel>2<nl>"
            ),
            "| A | B |\n| --- | --- |\n| 1 | 2 |"
        );
        assert_eq!(
            finish_text(OcrMode::Table, TableFormat::PaddleTags, " plain "),
            "plain"
        );
    }

    #[test]
    fn a_table_from_a_model_without_tags_follows_its_format() {
        let html = "<table>\n  <tr><td>A</td><td>B</td></tr>\n</table>\n";
        assert_eq!(
            finish_text(OcrMode::Table, TableFormat::AsIs, html),
            html.trim()
        );
        assert_eq!(
            finish_text(OcrMode::Table, TableFormat::HtmlOrMarkdown, html),
            "| A | B |\n| --- | --- |"
        );
        let markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |";
        assert_eq!(
            finish_text(OcrMode::Table, TableFormat::AsIs, markdown),
            markdown
        );
        assert_eq!(
            finish_text(OcrMode::Table, TableFormat::HtmlOrMarkdown, markdown),
            markdown
        );
        let tags = "<fcel>A<fcel>B<nl>";
        assert_eq!(finish_text(OcrMode::Table, TableFormat::AsIs, tags), tags);
        assert_eq!(
            finish_text(OcrMode::Table, TableFormat::HtmlOrMarkdown, tags),
            tags
        );
    }

    #[test]
    fn html_tables_are_converted_in_text_mode_too() {
        let reply =
            "Invoice\n<table><tr><th>Item</th></tr><tr><td>Cable</td></tr></table>\nTotal: 9";
        assert_eq!(
            finish_text(OcrMode::Text, TableFormat::HtmlOrMarkdown, reply),
            "Invoice\n\n| Item |\n| --- |\n| Cable |\n\nTotal: 9"
        );
        assert_eq!(
            finish_text(OcrMode::Table, TableFormat::HtmlOrMarkdown, reply),
            "Invoice\n\n| Item |\n| --- |\n| Cable |\n\nTotal: 9"
        );
        assert_eq!(finish_text(OcrMode::Text, TableFormat::AsIs, reply), reply);
    }

    #[test]
    fn a_text_reply_is_trimmed_in_either_format() {
        assert_eq!(
            finish_text(OcrMode::Text, TableFormat::PaddleTags, " hi \n"),
            "hi"
        );
        assert_eq!(
            finish_text(OcrMode::Text, TableFormat::AsIs, " hi \n"),
            "hi"
        );
        assert_eq!(
            finish_text(OcrMode::Text, TableFormat::HtmlOrMarkdown, " hi \n"),
            "hi"
        );
    }
}
