//! The curated OCR models: vision-language models from Hugging Face that run through the GenieX
//! server (llama.cpp). Each is a GGUF plus a projector, downloaded and imported into GenieX like a
//! model of the Models tab, so it shows there too. The webview picks a model by id; it never
//! supplies a URL or a prompt.

use serde::{Deserialize, Serialize};

const HF_PAGE_PREFIX: &str = "https://huggingface.co/";

/// What an OCR run reads the picture as. The values are the ids the webview sends.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OcrMode {
    /// All the text, as plain text.
    Text,
    /// A table, converted to a markdown table.
    Table,
}

/// One way to run a model, with the prompt it sends.
#[derive(Debug)]
pub(super) struct ModeRecipe {
    pub mode: OcrMode,
    pub label: &'static str,
    pub prompt: &'static str,
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
    /// The Hugging Face repo. It is also the name the model has in GenieX.
    pub repo: &'static str,
    /// The language model file.
    pub model: OcrFile,
    /// The vision projector file, downloaded first.
    pub projector: OcrFile,
    /// The precision label of the import.
    pub precision: &'static str,
    pub modes: &'static [ModeRecipe],
}

impl OcrRecipe {
    pub(super) fn size_bytes(&self) -> u64 {
        self.model.size_bytes + self.projector.size_bytes
    }

    /// The model's Hugging Face page, which states its licence.
    pub(super) fn repo_url(&self) -> String {
        format!("{HF_PAGE_PREFIX}{}", self.repo)
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
};

const MINICPM_OCR: OcrRecipe = OcrRecipe {
    id: "minicpm-ocr-1-0",
    name: "MiniCPM-OCR 1.0",
    description: "A compact 4-bit model that reads all the text in a picture.",
    best_for: "Plain text and receipts",
    license: "Apache-2.0",
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
    modes: &[ModeRecipe {
        mode: OcrMode::Text,
        label: "Text",
        prompt: "Read all text in this image.",
    }],
};

/// Every curated OCR model, in the order the webview lists them.
pub(super) const RECIPES: &[OcrRecipe] = &[PADDLEOCR_VL, MINICPM_OCR];

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
}

/// Describe `recipe` for the webview. `downloaded` is whether GenieX has it.
pub(super) fn describe(recipe: &OcrRecipe, downloaded: bool) -> OcrModel {
    OcrModel {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        best_for: recipe.best_for,
        license: recipe.license,
        license_url: recipe.repo_url(),
        size_bytes: recipe.size_bytes(),
        downloaded,
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
    fn the_catalogue_has_the_two_curated_models() {
        let ids: Vec<&str> = RECIPES.iter().map(|recipe| recipe.id).collect();
        assert_eq!(ids, ["paddleocr-vl-1-6", "minicpm-ocr-1-0"]);
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
        let mini = find_recipe("minicpm-ocr-1-0").expect("mini");
        assert_eq!(mini.size_bytes(), 529_106_816 + 901_017_536);
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
    }

    #[test]
    fn every_model_reads_text_and_only_paddle_reads_tables() {
        for recipe in RECIPES {
            assert!(recipe.mode(OcrMode::Text).is_ok(), "{}", recipe.id);
        }
        let paddle = find_recipe("paddleocr-vl-1-6").expect("paddle");
        assert_eq!(
            paddle.mode(OcrMode::Table).expect("table").prompt,
            "Table Recognition:"
        );
        assert_eq!(paddle.mode(OcrMode::Text).expect("text").prompt, "OCR:");
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
    fn the_import_precisions_are_the_ones_the_importer_accepts() {
        assert_eq!(
            find_recipe("paddleocr-vl-1-6").expect("p").precision,
            "BF16"
        );
        assert_eq!(
            find_recipe("minicpm-ocr-1-0").expect("m").precision,
            "Q4_K_M"
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
}
