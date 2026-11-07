//! The curated OCR models: vision-language models from Hugging Face that run through the GenieX
//! server (llama.cpp). Each is a GGUF plus a projector, downloaded and imported into GenieX like a
//! model of the Models tab, so it shows there too. The webview picks a model by id; it never
//! supplies a URL or a prompt.

use serde::{Deserialize, Serialize};

use super::model_links::ModelLinks;

const HF_PAGE_PREFIX: &str = "https://huggingface.co/";

/// What an OCR run reads the picture as. The values are the ids the webview sends.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrMode {
    /// All the text, as plain text.
    Text,
    /// A table. What the webview shows depends on the model's `TableFormat`.
    Table,
}

/// One way to run a model, with the prompt it sends.
#[derive(Debug)]
pub(super) struct ModeRecipe {
    pub mode: OcrMode,
    pub label: &'static str,
    pub prompt: &'static str,
}

/// How a model writes a table, which decides what Table mode shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum TableFormat {
    /// PaddleOCR's tag text (`<fcel>`, `<nl>`...), converted to a markdown table.
    PaddleTags,
    /// HTML tables (`<table>`), converted to markdown tables in either mode. Markdown and text are
    /// shown as the model wrote them.
    HtmlOrMarkdown,
    /// HTML or markdown written by the model, shown as it is.
    AsIs,
}

/// One file of a model, in its Hugging Face repo.
#[derive(Debug)]
pub(super) struct OcrFile {
    pub name: &'static str,
    pub size_bytes: u64,
}

/// One curated OCR model.
#[derive(Debug)]
pub(super) struct OcrRecipe {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub best_for: &'static str,
    pub license: &'static str,
    /// The Hugging Face repo whose page states the licence.
    pub license_repo: &'static str,
    /// The Hugging Face repo. It is also the name the model has in GenieX.
    pub repo: &'static str,
    /// The language model file.
    pub model: OcrFile,
    /// The vision projector file, downloaded first.
    pub projector: OcrFile,
    /// The precision label of the import.
    pub precision: &'static str,
    /// Most tokens the model may write for one picture (the request's `max_tokens`).
    pub max_tokens: u32,
    /// The context window sent as `nctx` with every request. The picture, the prompt and the output
    /// must fit in it, and it stays the same for every request so the server does not reload.
    pub context_tokens: u32,
    pub modes: &'static [ModeRecipe],
    pub table_format: TableFormat,
    /// Where the model comes from, and where its card is.
    pub links: ModelLinks,
}

impl OcrRecipe {
    pub(super) fn size_bytes(&self) -> u64 {
        self.model.size_bytes + self.projector.size_bytes
    }

    /// The Hugging Face page that states the licence.
    pub(super) fn license_url(&self) -> String {
        format!("{HF_PAGE_PREFIX}{}", self.license_repo)
    }

    /// The download folder under Downloads: `owner/name` becomes `owner--name`, as in the Models tab.
    pub(super) fn folder(&self) -> String {
        self.repo.replace('/', "--")
    }

    /// The files in download order: projector first, then the model.
    pub(super) fn files_in_order(&self) -> [&OcrFile; 2] {
        [&self.projector, &self.model]
    }

    /// The URL of one of this model's files.
    pub(super) fn file_url(&self, file: &OcrFile) -> String {
        format!(
            "{HF_PAGE_PREFIX}{}/resolve/main/{}?download=true",
            self.repo, file.name
        )
    }

    /// The recipe of `mode`, or an error naming the modes this model has.
    pub(super) fn mode(&self, mode: OcrMode) -> Result<&ModeRecipe, String> {
        self.modes
            .iter()
            .find(|recipe| recipe.mode == mode)
            .ok_or_else(|| {
                let labels: Vec<&str> = self.modes.iter().map(|recipe| recipe.label).collect();
                format!(
                    "{} does not support that mode. Use {}.",
                    self.name,
                    labels.join(" or ")
                )
            })
    }
}

const PADDLEOCR_VL: OcrRecipe = OcrRecipe {
    id: "paddleocr-vl-1-6",
    name: "PaddleOCR-VL 1.6",
    description: "A 0.9 billion parameter document model. Reads text, and can turn a table into a markdown table.",
    best_for: "Documents, tables and mixed layouts",
    license: "Apache-2.0",
    license_repo: "PaddlePaddle/PaddleOCR-VL-1.6-GGUF",
    repo: "PaddlePaddle/PaddleOCR-VL-1.6-GGUF",
    model: OcrFile {
        name: "PaddleOCR-VL-1.6-GGUF.gguf",
        size_bytes: 935_769_056,
    },
    projector: OcrFile {
        name: "PaddleOCR-VL-1.6-GGUF-mmproj.gguf",
        size_bytes: 881_770_560,
    },
    precision: "BF16",
    // 4096 output for a dense page; 8192 window, well under the trained 131072.
    max_tokens: 4096,
    context_tokens: 8192,
    modes: &[
        ModeRecipe {
            mode: OcrMode::Text,
            label: "Text",
            prompt: "OCR:",
        },
        ModeRecipe {
            mode: OcrMode::Table,
            label: "Table",
            prompt: "Table Recognition:",
        },
    ],
    table_format: TableFormat::PaddleTags,
    links: ModelLinks {
        card_repo: Some("PaddlePaddle/PaddleOCR-VL-1.6"),
        source_url: "https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF",
        docs_url: None,
    },
};

const GLM_OCR: OcrRecipe = OcrRecipe {
    id: "glm-ocr",
    name: "GLM-OCR",
    description: "A 0.9 billion parameter document model from Z.ai. Reads text, and writes a table as HTML or markdown.",
    best_for: "Documents and tables",
    license: "MIT",
    // The GGUF card states no licence; the original model's card does.
    license_repo: "zai-org/GLM-OCR",
    repo: "ggml-org/GLM-OCR-GGUF",
    model: OcrFile {
        name: "GLM-OCR-Q8_0.gguf",
        size_bytes: 950_433_408,
    },
    projector: OcrFile {
        name: "mmproj-GLM-OCR-Q8_0.gguf",
        size_bytes: 484_403_648,
    },
    precision: "Q8_0",
    // 8192 output for a full page of HTML tables; 16384 window, well under the trained 131072.
    max_tokens: 8192,
    context_tokens: 16384,
    modes: &[
        ModeRecipe {
            mode: OcrMode::Text,
            label: "Text",
            prompt: "Text Recognition:",
        },
        ModeRecipe {
            mode: OcrMode::Table,
            label: "Table",
            prompt: "Table Recognition:",
        },
    ],
    table_format: TableFormat::HtmlOrMarkdown,
    links: ModelLinks {
        card_repo: Some("zai-org/GLM-OCR"),
        source_url: "https://huggingface.co/ggml-org/GLM-OCR-GGUF",
        docs_url: None,
    },
};

const MINICPM_OCR: OcrRecipe = OcrRecipe {
    id: "minicpm-ocr-1-0",
    name: "MiniCPM-OCR 1.0",
    description: "A compact 4-bit model that reads all the text in a picture.",
    best_for: "Plain text and receipts",
    license: "Apache-2.0",
    license_repo: "openbmb/MiniCPM-OCR-1.0-gguf",
    repo: "openbmb/MiniCPM-OCR-1.0-gguf",
    model: OcrFile {
        name: "MiniCPM-OCR-1_0-Q4_K_M.gguf",
        size_bytes: 529_106_816,
    },
    projector: OcrFile {
        name: "mmproj-model-f16-4x.gguf",
        size_bytes: 901_017_536,
    },
    precision: "Q4_K_M",
    // 4096 output for a dense page; 8192 window, well under the trained 262144.
    max_tokens: 4096,
    context_tokens: 8192,
    modes: &[ModeRecipe {
        mode: OcrMode::Text,
        label: "Text",
        prompt: "Read all text in this image.",
    }],
    table_format: TableFormat::AsIs,
    links: ModelLinks {
        card_repo: Some("openbmb/MiniCPM-OCR-1.0"),
        source_url: "https://huggingface.co/openbmb/MiniCPM-OCR-1.0-gguf",
        docs_url: None,
    },
};

const QWEN3_VL: OcrRecipe = OcrRecipe {
    id: "qwen3-vl-2b-instruct",
    name: "Qwen3-VL-2B-Instruct",
    description: "Balanced: a 2 billion parameter general vision model that reads the text and tables in a picture, with a 2.3 GB download.",
    best_for: "General pictures, and layouts and tables too",
    license: "Apache-2.0",
    // The GGUF card states no licence; the original model's card does.
    license_repo: "Qwen/Qwen3-VL-2B-Instruct",
    repo: "ggml-org/Qwen3-VL-2B-Instruct-GGUF",
    model: OcrFile {
        name: "Qwen3-VL-2B-Instruct-Q8_0.gguf",
        size_bytes: 1_834_427_296,
    },
    projector: OcrFile {
        name: "mmproj-Qwen3-VL-2B-Instruct-Q8_0.gguf",
        size_bytes: 445_053_056,
    },
    precision: "Q8_0",
    // 4096 output; a 2500 px picture is about 6100 tokens (32 px a token), so 16384 holds it.
    max_tokens: 4096,
    context_tokens: 16384,
    modes: &[
        ModeRecipe {
            mode: OcrMode::Text,
            label: "Text",
            prompt: "Read all the text in this image.",
        },
        ModeRecipe {
            mode: OcrMode::Table,
            label: "Table",
            prompt: "Extract the table in this image as a Markdown table.",
        },
    ],
    table_format: TableFormat::HtmlOrMarkdown,
    links: ModelLinks {
        card_repo: Some("Qwen/Qwen3-VL-2B-Instruct"),
        source_url: "https://huggingface.co/ggml-org/Qwen3-VL-2B-Instruct-GGUF",
        docs_url: None,
    },
};

const DOTS_OCR: OcrRecipe = OcrRecipe {
    id: "dots-ocr",
    name: "dots.ocr",
    description: "Best quality: a 1.7 billion parameter multilingual document model that reads the text of a page, with a 3.2 GB download.",
    best_for: "Multilingual documents",
    license: "MIT",
    // The GGUF card states the MIT licence.
    license_repo: "ggml-org/dots.ocr-GGUF",
    repo: "ggml-org/dots.ocr-GGUF",
    model: OcrFile {
        name: "dots.ocr-Q8_0.gguf",
        size_bytes: 1_894_530_272,
    },
    projector: OcrFile {
        name: "mmproj-dots.ocr-Q8_0.gguf",
        size_bytes: 1_344_068_512,
    },
    precision: "Q8_0",
    // 4096 output; a 2500 px picture is about 8000 tokens (28 px a token), so 16384 holds it.
    max_tokens: 4096,
    context_tokens: 16384,
    modes: &[ModeRecipe {
        mode: OcrMode::Text,
        label: "Text",
        // The prompt_ocr of the repo's dots_ocr/utils/prompts.py.
        prompt: "Extract the text content from this image.",
    }],
    table_format: TableFormat::AsIs,
    links: ModelLinks {
        card_repo: Some("rednote-hilab/dots.ocr"),
        source_url: "https://huggingface.co/ggml-org/dots.ocr-GGUF",
        docs_url: None,
    },
};

const DEEPSEEK_OCR: OcrRecipe = OcrRecipe {
    id: "deepseek-ocr",
    name: "DeepSeek-OCR",
    description: "Balanced: DeepSeek's document model, which reads a page as plain text or converts it to markdown, with a 3.6 GB download.",
    best_for: "Documents turned into markdown",
    license: "MIT",
    license_repo: "deepseek-ai/DeepSeek-OCR",
    repo: "ggml-org/DeepSeek-OCR-GGUF",
    model: OcrFile {
        name: "DeepSeek-OCR-Q8_0.gguf",
        size_bytes: 3_126_139_712,
    },
    projector: OcrFile {
        name: "mmproj-DeepSeek-OCR-Q8_0.gguf",
        size_bytes: 447_856_768,
    },
    precision: "Q8_0",
    // 4096 output. The trained length is 8192, so the window is 8192 too: a larger one is over it.
    max_tokens: 4096,
    context_tokens: 8192,
    modes: &[
        ModeRecipe {
            mode: OcrMode::Text,
            label: "Text",
            prompt: "Free OCR. ",
        },
        // The webview knows only the modes text and table, so this document prompt is sent as the
        // table mode and labelled Document.
        ModeRecipe {
            mode: OcrMode::Table,
            label: "Document",
            prompt: "<|grounding|>Convert the document to markdown. ",
        },
    ],
    table_format: TableFormat::HtmlOrMarkdown,
    links: ModelLinks {
        card_repo: Some("deepseek-ai/DeepSeek-OCR"),
        source_url: "https://huggingface.co/ggml-org/DeepSeek-OCR-GGUF",
        docs_url: None,
    },
};

/// Every curated OCR model, smallest download first: the order the webview lists them.
pub(super) const RECIPES: &[OcrRecipe] = &[
    MINICPM_OCR,
    GLM_OCR,
    PADDLEOCR_VL,
    QWEN3_VL,
    DOTS_OCR,
    DEEPSEEK_OCR,
];

/// The recipe with `id`, or an error for an unknown id.
pub(super) fn find_recipe(id: &str) -> Result<&'static OcrRecipe, String> {
    RECIPES
        .iter()
        .find(|recipe| recipe.id == id)
        .ok_or_else(|| format!("Unknown OCR model: {id}"))
}

/// One mode as the webview sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OcrModeInfo {
    pub id: OcrMode,
    pub label: &'static str,
}

/// An OCR model as `playground_ocr_models` returns it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrModel {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub best_for: &'static str,
    pub license: &'static str,
    pub license_url: String,
    pub size_bytes: u64,
    /// True when GenieX has the model.
    pub downloaded: bool,
    pub modes: Vec<OcrModeInfo>,
    pub links: ModelLinks,
}

/// Describe `recipe` for the webview. `downloaded` is whether GenieX has it.
pub(super) fn describe(recipe: &OcrRecipe, downloaded: bool) -> OcrModel {
    OcrModel {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        best_for: recipe.best_for,
        license: recipe.license,
        license_url: recipe.license_url(),
        size_bytes: recipe.size_bytes(),
        downloaded,
        links: recipe.links,
        modes: recipe
            .modes
            .iter()
            .map(|mode| OcrModeInfo {
                id: mode.mode,
                label: mode.label,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::super::{catalog, speech_catalog, upscale_catalog};
    use super::*;
    use crate::commands::download::validate_file_name;

    #[test]
    fn the_catalogue_has_the_six_curated_models_in_order() {
        assert_eq!(RECIPES.len(), 6);
        let ids: Vec<&str> = RECIPES.iter().map(|recipe| recipe.id).collect();
        assert_eq!(
            ids,
            [
                "minicpm-ocr-1-0",
                "glm-ocr",
                "paddleocr-vl-1-6",
                "qwen3-vl-2b-instruct",
                "dots-ocr",
                "deepseek-ocr",
            ]
        );
    }

    #[test]
    fn the_catalogue_is_sorted_by_download_size_smallest_first() {
        for pair in RECIPES.windows(2) {
            assert!(
                pair[0].size_bytes() <= pair[1].size_bytes(),
                "{} is listed before the smaller {}",
                pair[0].id,
                pair[1].id
            );
        }
    }

    #[test]
    fn ids_and_repos_are_unique() {
        let ids: HashSet<_> = RECIPES.iter().map(|recipe| recipe.id).collect();
        let repos: HashSet<_> = RECIPES.iter().map(|recipe| recipe.repo).collect();
        assert_eq!(ids.len(), RECIPES.len());
        assert_eq!(repos.len(), RECIPES.len());
    }

    #[test]
    fn ids_do_not_clash_with_image_upscale_or_speech_models() {
        for recipe in RECIPES {
            assert!(catalog::find_recipe(recipe.id).is_err(), "{}", recipe.id);
            assert!(
                upscale_catalog::find_recipe(recipe.id).is_err(),
                "{}",
                recipe.id
            );
            assert!(
                speech_catalog::find_recipe(recipe.id).is_err(),
                "{}",
                recipe.id
            );
        }
    }

    #[test]
    fn size_is_the_sum_of_both_files() {
        let paddle = find_recipe("paddleocr-vl-1-6").expect("paddle");
        assert_eq!(paddle.size_bytes(), 935_769_056 + 881_770_560);
        let glm = find_recipe("glm-ocr").expect("glm");
        assert_eq!(glm.size_bytes(), 950_433_408 + 484_403_648);
        let mini = find_recipe("minicpm-ocr-1-0").expect("mini");
        assert_eq!(mini.size_bytes(), 529_106_816 + 901_017_536);
        let qwen = find_recipe("qwen3-vl-2b-instruct").expect("qwen");
        assert_eq!(qwen.size_bytes(), 1_834_427_296 + 445_053_056);
        let dots = find_recipe("dots-ocr").expect("dots");
        assert_eq!(dots.size_bytes(), 1_894_530_272 + 1_344_068_512);
        let deepseek = find_recipe("deepseek-ocr").expect("deepseek");
        assert_eq!(deepseek.size_bytes(), 3_126_139_712 + 447_856_768);
    }

    #[test]
    fn the_projector_downloads_before_the_model() {
        for recipe in RECIPES {
            let [first, second] = recipe.files_in_order();
            assert!(first.name.contains("mmproj"), "{}", recipe.id);
            assert_eq!(second.name, recipe.model.name);
        }
    }

    #[test]
    fn urls_are_on_hugging_face_and_names_are_bare() {
        for recipe in RECIPES {
            for file in recipe.files_in_order() {
                let url = recipe.file_url(file);
                assert!(url.starts_with("https://huggingface.co/"), "{url}");
                assert!(validate_file_name(file.name).is_ok(), "{}", file.name);
            }
            assert!(validate_file_name(&recipe.folder()).is_ok());
        }
        assert_eq!(
            find_recipe("minicpm-ocr-1-0").expect("mini").folder(),
            "openbmb--MiniCPM-OCR-1.0-gguf"
        );
        assert_eq!(
            find_recipe("glm-ocr").expect("glm").folder(),
            "ggml-org--GLM-OCR-GGUF"
        );
        assert_eq!(
            find_recipe("dots-ocr").expect("dots").folder(),
            "ggml-org--dots.ocr-GGUF"
        );
    }

    #[test]
    fn the_new_files_are_the_published_ones() {
        let qwen = find_recipe("qwen3-vl-2b-instruct").expect("qwen");
        assert_eq!(qwen.model.name, "Qwen3-VL-2B-Instruct-Q8_0.gguf");
        assert_eq!(qwen.projector.name, "mmproj-Qwen3-VL-2B-Instruct-Q8_0.gguf");
        let dots = find_recipe("dots-ocr").expect("dots");
        assert_eq!(dots.model.name, "dots.ocr-Q8_0.gguf");
        assert_eq!(dots.projector.name, "mmproj-dots.ocr-Q8_0.gguf");
        let deepseek = find_recipe("deepseek-ocr").expect("deepseek");
        assert_eq!(deepseek.model.name, "DeepSeek-OCR-Q8_0.gguf");
        assert_eq!(deepseek.projector.name, "mmproj-DeepSeek-OCR-Q8_0.gguf");
        assert_eq!(
            deepseek.file_url(&deepseek.projector),
            "https://huggingface.co/ggml-org/DeepSeek-OCR-GGUF/resolve/main/mmproj-DeepSeek-OCR-Q8_0.gguf?download=true"
        );
    }

    #[test]
    fn the_glm_files_and_urls_are_the_published_ones() {
        let glm = find_recipe("glm-ocr").expect("glm");
        assert_eq!(glm.model.name, "GLM-OCR-Q8_0.gguf");
        assert_eq!(glm.projector.name, "mmproj-GLM-OCR-Q8_0.gguf");
        assert_eq!(
            glm.file_url(&glm.model),
            "https://huggingface.co/ggml-org/GLM-OCR-GGUF/resolve/main/GLM-OCR-Q8_0.gguf?download=true"
        );
        assert_eq!(glm.license_url(), "https://huggingface.co/zai-org/GLM-OCR");
    }

    #[test]
    fn every_model_reads_text_and_the_table_modes_are_as_listed() {
        for recipe in RECIPES {
            assert!(recipe.mode(OcrMode::Text).is_ok(), "{}", recipe.id);
        }
        let paddle = find_recipe("paddleocr-vl-1-6").expect("paddle");
        assert_eq!(
            paddle.mode(OcrMode::Table).expect("table").prompt,
            "Table Recognition:"
        );
        assert_eq!(paddle.mode(OcrMode::Text).expect("text").prompt, "OCR:");
        let glm = find_recipe("glm-ocr").expect("glm");
        assert_eq!(
            glm.mode(OcrMode::Text).expect("text").prompt,
            "Text Recognition:"
        );
        assert_eq!(
            glm.mode(OcrMode::Table).expect("table").prompt,
            "Table Recognition:"
        );
        let mini = find_recipe("minicpm-ocr-1-0").expect("mini");
        assert_eq!(
            mini.mode(OcrMode::Text).expect("text").prompt,
            "Read all text in this image."
        );
        let error = mini.mode(OcrMode::Table).expect_err("no table");
        assert!(
            error.contains("MiniCPM-OCR 1.0") && error.contains("Text"),
            "{error}"
        );
    }

    #[test]
    fn the_new_models_have_the_sourced_prompts_and_modes() {
        let qwen = find_recipe("qwen3-vl-2b-instruct").expect("qwen");
        assert_eq!(
            qwen.mode(OcrMode::Text).expect("text").prompt,
            "Read all the text in this image."
        );
        assert_eq!(
            qwen.mode(OcrMode::Table).expect("table").prompt,
            "Extract the table in this image as a Markdown table."
        );

        let dots = find_recipe("dots-ocr").expect("dots");
        assert_eq!(dots.modes.len(), 1, "the repo has no live table prompt");
        assert_eq!(
            dots.mode(OcrMode::Text).expect("text").prompt,
            "Extract the text content from this image."
        );
        assert!(dots.mode(OcrMode::Table).is_err());

        let deepseek = find_recipe("deepseek-ocr").expect("deepseek");
        assert_eq!(
            deepseek.mode(OcrMode::Text).expect("text").prompt,
            "Free OCR. "
        );
        let document = deepseek.mode(OcrMode::Table).expect("document");
        assert_eq!(document.label, "Document");
        assert_eq!(
            document.prompt,
            "<|grounding|>Convert the document to markdown. "
        );
    }

    #[test]
    fn no_prompt_carries_the_image_token() {
        for recipe in RECIPES {
            for mode in recipe.modes {
                assert!(
                    !mode.prompt.contains("<image>"),
                    "{} {:?} sends <image>; the chat endpoint adds the picture",
                    recipe.id,
                    mode.mode
                );
            }
        }
    }

    #[test]
    fn every_recipe_reads_text_and_has_unique_mode_labels() {
        for recipe in RECIPES {
            assert_eq!(
                recipe.modes.first().map(|mode| mode.mode),
                Some(OcrMode::Text),
                "{} must list text first",
                recipe.id
            );
            let labels: HashSet<&str> = recipe.modes.iter().map(|mode| mode.label).collect();
            assert_eq!(labels.len(), recipe.modes.len(), "{}", recipe.id);
        }
    }

    #[test]
    fn each_model_has_its_table_format() {
        assert_eq!(
            find_recipe("paddleocr-vl-1-6").expect("p").table_format,
            TableFormat::PaddleTags
        );
        assert_eq!(
            find_recipe("glm-ocr").expect("g").table_format,
            TableFormat::HtmlOrMarkdown
        );
        assert_eq!(
            find_recipe("minicpm-ocr-1-0").expect("m").table_format,
            TableFormat::AsIs
        );
        assert_eq!(
            find_recipe("qwen3-vl-2b-instruct").expect("q").table_format,
            TableFormat::HtmlOrMarkdown
        );
        assert_eq!(
            find_recipe("deepseek-ocr").expect("d").table_format,
            TableFormat::HtmlOrMarkdown
        );
        assert_eq!(
            find_recipe("dots-ocr").expect("o").table_format,
            TableFormat::AsIs
        );
    }

    #[test]
    fn the_import_precisions_are_the_ones_the_importer_accepts() {
        assert_eq!(
            find_recipe("paddleocr-vl-1-6").expect("p").precision,
            "BF16"
        );
        assert_eq!(find_recipe("glm-ocr").expect("g").precision, "Q8_0");
        assert_eq!(
            find_recipe("minicpm-ocr-1-0").expect("m").precision,
            "Q4_K_M"
        );
        for id in ["qwen3-vl-2b-instruct", "dots-ocr", "deepseek-ocr"] {
            assert_eq!(find_recipe(id).expect(id).precision, "Q8_0", "{id}");
        }
    }

    /// Trained context length of PaddleOCR-VL 1.6: `gguf.context_length` from the Hugging Face API
    /// (`/api/models/<repo>?expand[]=gguf`), read 2026-11-06.
    const PADDLEOCR_VL_TRAINED_CONTEXT: u32 = 131_072;
    /// Trained context length of GLM-OCR: `gguf.context_length` from the Hugging Face API, read
    /// 2026-11-06. The GGUF header of `GLM-OCR-Q8_0.gguf` gives the same (`glm4.context_length`).
    const GLM_OCR_TRAINED_CONTEXT: u32 = 131_072;
    /// Trained context length of MiniCPM-OCR 1.0: `gguf.context_length` from the Hugging Face API,
    /// read 2026-11-06.
    const MINICPM_OCR_TRAINED_CONTEXT: u32 = 262_144;
    /// Trained context length of Qwen3-VL-2B-Instruct: `gguf.context_length` of its GGUF repo (the
    /// Hugging Face API, `?expand[]=gguf`), read 2026-11-06.
    const QWEN3_VL_TRAINED_CONTEXT: u32 = 262_144;
    /// Trained context length of dots.ocr: `gguf.context_length` of its GGUF repo, read 2026-11-06.
    const DOTS_OCR_TRAINED_CONTEXT: u32 = 131_072;
    /// Trained context length of DeepSeek-OCR: `gguf.context_length` of its GGUF repo, read
    /// 2026-11-06. It is 8192, so no window over 8192 is allowed.
    const DEEPSEEK_OCR_TRAINED_CONTEXT: u32 = 8_192;

    /// The trained context length of a curated model, or None for an id this test does not know.
    fn trained_context(id: &str) -> Option<u32> {
        match id {
            "paddleocr-vl-1-6" => Some(PADDLEOCR_VL_TRAINED_CONTEXT),
            "glm-ocr" => Some(GLM_OCR_TRAINED_CONTEXT),
            "minicpm-ocr-1-0" => Some(MINICPM_OCR_TRAINED_CONTEXT),
            "qwen3-vl-2b-instruct" => Some(QWEN3_VL_TRAINED_CONTEXT),
            "dots-ocr" => Some(DOTS_OCR_TRAINED_CONTEXT),
            "deepseek-ocr" => Some(DEEPSEEK_OCR_TRAINED_CONTEXT),
            _ => None,
        }
    }

    #[test]
    fn every_recipe_has_an_output_cap_and_a_window_that_fits_its_model() {
        for recipe in RECIPES {
            let trained = trained_context(recipe.id)
                .unwrap_or_else(|| panic!("{} needs a trained context length", recipe.id));
            assert!(recipe.max_tokens > 0, "{}", recipe.id);
            assert!(
                recipe.context_tokens >= 2 * recipe.max_tokens,
                "{}: the window must hold the picture and the output",
                recipe.id
            );
            assert!(
                recipe.context_tokens <= trained,
                "{}: the window is over the trained length {trained}",
                recipe.id
            );
        }
    }

    #[test]
    fn glm_ocr_kv_cache_at_its_window_is_about_1_1_gb() {
        // GLM-OCR's GGUF header (glm4): 17 layers, 8 KV heads, key and value width 128 each.
        let header = crate::gguf::GgufHeader {
            block_count: Some(17),
            head_count: Some(16),
            head_count_kv: Some(8),
            embedding_length: Some(1536),
            key_length: Some(128),
            value_length: Some(128),
            ..Default::default()
        };
        let glm = find_recipe("glm-ocr").expect("glm");
        assert_eq!(
            header.kv_cache_bytes(u64::from(glm.context_tokens)),
            Some(1_140_850_688)
        );
    }

    #[test]
    fn an_unknown_id_is_refused() {
        assert!(find_recipe("nope").is_err());
        assert!(find_recipe("").is_err());
    }

    #[test]
    fn model_json_uses_the_frontend_names() {
        let model = describe(find_recipe("paddleocr-vl-1-6").expect("paddle"), true);
        let json = serde_json::to_value(&model).expect("json");
        for key in [
            "id",
            "name",
            "description",
            "bestFor",
            "license",
            "licenseUrl",
            "sizeBytes",
            "downloaded",
            "modes",
        ] {
            assert!(json.get(key).is_some(), "missing {key}");
        }
        assert_eq!(
            json["licenseUrl"],
            "https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF"
        );
        assert_eq!(json["license"], "Apache-2.0");
        assert_eq!(json["modes"][0]["id"], "text");
        assert_eq!(
            json["modes"][1],
            serde_json::json!({"id": "table", "label": "Table"})
        );
        assert_eq!(json["downloaded"], true);
    }

    #[test]
    fn every_recipe_links_to_its_repo_and_its_card() {
        for recipe in RECIPES {
            super::super::model_links::assert_well_formed(recipe.id, &recipe.links);
            assert_eq!(
                recipe.links.source_url,
                format!("https://huggingface.co/{}", recipe.repo),
                "{} downloads from its repo",
                recipe.id
            );
        }
    }

    #[test]
    fn the_listing_carries_the_links() {
        let recipe = find_recipe("paddleocr-vl-1-6").expect("paddle");
        let model = describe(recipe, true);
        assert_eq!(model.links, recipe.links);
        let json = serde_json::to_value(&model).expect("json");
        assert_eq!(json["links"]["cardRepo"], "PaddlePaddle/PaddleOCR-VL-1.6");
        assert!(json["links"]["docsUrl"].is_null());
    }
}
