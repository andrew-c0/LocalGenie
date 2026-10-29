//! The curated text-to-image models: the Hugging Face files each one needs, the sd-cli flags that
//! load them, and the defaults the Playground starts with.
//!
//! Files are stored per repo under `<models root>/<owner--repo>/<file name>`, so a file shared by two
//! recipes (the Qwen3 text encoder) is downloaded and kept once.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// The Apache 2.0 licence text, shown on a model card. Image and speech models both use it.
pub(super) const APACHE_LICENSE_URL: &str = "https://www.apache.org/licenses/LICENSE-2.0";
const SD15_LICENSE_URL: &str = "https://huggingface.co/spaces/CompVis/stable-diffusion-license";

/// What a model file is for. A recipe's `flags` map each role to the sd-cli flag that loads it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ModelRole {
    /// The diffusion model (or the full checkpoint for Stable Diffusion 1.x).
    Model,
    Vae,
    /// The text encoder.
    Llm,
}

/// What a model does with an input image. `Init` is image-to-image from a starting picture (sd-cli
/// `-i` with `--strength`). `Reference` is an instruction edit that takes the picture as context
/// (sd-cli `-r`, no strength). `None` is text-to-image only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ImageInput {
    None,
    Init,
    Reference,
}

/// One file of a recipe, fetched from `https://huggingface.co/<repo>/resolve/main/<path_in_repo>`.
#[derive(Debug, Clone, Copy)]
pub(super) struct ModelFile {
    pub repo: &'static str,
    pub path_in_repo: &'static str,
    /// Size of the file on Hugging Face, in bytes. Checked after each download.
    pub size_bytes: u64,
    pub role: ModelRole,
}

impl ModelFile {
    /// The last path segment: the name the file has on disk.
    pub(super) fn file_name(&self) -> &'static str {
        self.path_in_repo
            .rsplit('/')
            .next()
            .unwrap_or(self.path_in_repo)
    }
}

/// Starting values for the generation form.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageDefaults {
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg_scale: f32,
}

/// One curated model: its licence, its files and how stable-diffusion.cpp loads them.
#[derive(Debug)]
pub(super) struct ImageRecipe {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub license_url: &'static str,
    pub files: &'static [ModelFile],
    /// The sd-cli flag for each role, in the order the flags are passed.
    pub flags: &'static [(&'static str, ModelRole)],
    pub defaults: ImageDefaults,
    /// False when the model ignores a negative prompt, so sd-cli is not given one.
    pub supports_negative_prompt: bool,
    /// False for a distilled model whose CFG scale is fixed at its default.
    pub cfg_adjustable: bool,
    pub image_input: ImageInput,
}

/// The Qwen3 text encoder used by both FLUX.2 klein and Z-Image Turbo. One copy on disk.
const QWEN3_4B_LLM: ModelFile = ModelFile {
    repo: "unsloth/Qwen3-4B-GGUF",
    path_in_repo: "Qwen3-4B-Q4_K_M.gguf",
    size_bytes: 2_497_281_312,
    role: ModelRole::Llm,
};

const SD15_Q4: ImageRecipe = ImageRecipe {
    id: "sd15-q4",
    name: "Stable Diffusion 1.5 (Q4)",
    description: "The original 512 px Stable Diffusion checkpoint, quantised to 4 bits. Small and quick on the CPU.",
    license: "CreativeML OpenRAIL-M",
    license_url: SD15_LICENSE_URL,
    files: &[ModelFile {
        repo: "gpustack/stable-diffusion-v1-5-GGUF",
        path_in_repo: "stable-diffusion-v1-5-Q4_0.gguf",
        size_bytes: 1_747_190_784,
        role: ModelRole::Model,
    }],
    flags: &[("-m", ModelRole::Model)],
    defaults: ImageDefaults {
        width: 512,
        height: 512,
        steps: 20,
        cfg_scale: 7.0,
    },
    supports_negative_prompt: true,
    cfg_adjustable: true,
    image_input: ImageInput::Init,
};

const FLUX2_KLEIN_4B_Q4: ImageRecipe = ImageRecipe {
    id: "flux2-klein-4b-q4",
    name: "FLUX.2 klein 4B (Q4)",
    description:
        "A 4 billion parameter FLUX.2 model, quantised to 4 bits. Good detail in four steps.",
    license: "Apache-2.0",
    license_url: APACHE_LICENSE_URL,
    files: &[
        ModelFile {
            repo: "leejet/FLUX.2-klein-4B-GGUF",
            path_in_repo: "flux-2-klein-4b-Q4_0.gguf",
            size_bytes: 2_460_378_560,
            role: ModelRole::Model,
        },
        ModelFile {
            repo: "Comfy-Org/Flux-2-Klein-4B",
            path_in_repo: "split_files/vae/flux2-vae.safetensors",
            size_bytes: 336_211_292,
            role: ModelRole::Vae,
        },
        QWEN3_4B_LLM,
    ],
    flags: &[
        ("--diffusion-model", ModelRole::Model),
        ("--vae", ModelRole::Vae),
        ("--llm", ModelRole::Llm),
    ],
    defaults: ImageDefaults {
        width: 512,
        height: 512,
        steps: 4,
        cfg_scale: 1.0,
    },
    supports_negative_prompt: false,
    cfg_adjustable: false,
    image_input: ImageInput::Reference,
};

const Z_IMAGE_TURBO_Q4: ImageRecipe = ImageRecipe {
    id: "z-image-turbo-q4",
    name: "Z-Image Turbo (Q4)",
    description: "A few-step text-to-image model, quantised to 4 bits. Eight steps by default.",
    license: "Apache-2.0",
    license_url: APACHE_LICENSE_URL,
    files: &[
        ModelFile {
            repo: "leejet/Z-Image-Turbo-GGUF",
            path_in_repo: "z_image_turbo-Q4_0.gguf",
            size_bytes: 3_683_370_944,
            role: ModelRole::Model,
        },
        ModelFile {
            repo: "wbruna/Z-Image-Turbo-sdcpp-GGUF",
            path_in_repo: "ae-f16.gguf",
            size_bytes: 167_656_704,
            role: ModelRole::Vae,
        },
        QWEN3_4B_LLM,
    ],
    flags: &[
        ("--diffusion-model", ModelRole::Model),
        ("--vae", ModelRole::Vae),
        ("--llm", ModelRole::Llm),
    ],
    defaults: ImageDefaults {
        width: 512,
        height: 512,
        steps: 8,
        cfg_scale: 1.0,
    },
    supports_negative_prompt: false,
    cfg_adjustable: false,
    image_input: ImageInput::None,
};

/// Every curated model, in the order the Playground lists them.
pub(super) const RECIPES: &[ImageRecipe] = &[SD15_Q4, FLUX2_KLEIN_4B_Q4, Z_IMAGE_TURBO_Q4];

/// The recipe with this id, or an error for an id that is not in the catalogue.
pub(super) fn find_recipe(id: &str) -> Result<&'static ImageRecipe, String> {
    RECIPES
        .iter()
        .find(|recipe| recipe.id == id)
        .ok_or_else(|| format!("Unknown image model: {id}"))
}

/// A model as the Playground lists it, with the state of its files on disk.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageModel {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub license_url: &'static str,
    pub total_bytes: u64,
    pub downloaded: bool,
    pub files: Vec<ImageModelFile>,
    pub defaults: ImageDefaults,
    pub supports_negative_prompt: bool,
    pub cfg_adjustable: bool,
    pub image_input: ImageInput,
}

/// One file of a listed model.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageModelFile {
    pub file_name: &'static str,
    pub size_bytes: u64,
    pub present: bool,
}

/// The listing entry for `recipe`, checking each file under `models_root`.
pub(super) fn describe(recipe: &'static ImageRecipe, models_root: &Path) -> ImageModel {
    let files: Vec<ImageModelFile> = recipe
        .files
        .iter()
        .map(|file| ImageModelFile {
            file_name: file.file_name(),
            size_bytes: file.size_bytes,
            present: local_path(models_root, file).is_file(),
        })
        .collect();
    ImageModel {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        license: recipe.license,
        license_url: recipe.license_url,
        total_bytes: recipe.files.iter().map(|file| file.size_bytes).sum(),
        downloaded: files.iter().all(|file| file.present),
        files,
        defaults: recipe.defaults,
        supports_negative_prompt: recipe.supports_negative_prompt,
        cfg_adjustable: recipe.cfg_adjustable,
        image_input: recipe.image_input,
    }
}

/// True when every file of `recipe` is on disk.
pub(super) fn is_downloaded(recipe: &ImageRecipe, models_root: &Path) -> bool {
    recipe
        .files
        .iter()
        .all(|file| local_path(models_root, file).is_file())
}

impl ImageRecipe {
    /// Local path of each file, paired with its role, in recipe order.
    pub(super) fn local_paths(&self, models_root: &Path) -> Vec<(ModelRole, PathBuf)> {
        self.files
            .iter()
            .map(|file| (file.role, local_path(models_root, file)))
            .collect()
    }
}

/// The folder a file is stored in: `<models root>/<owner--repo>`.
pub(super) fn local_dir(models_root: &Path, file: &ModelFile) -> PathBuf {
    models_root.join(file.repo.replace('/', "--"))
}

/// Where a file is stored on disk.
pub(super) fn local_path(models_root: &Path, file: &ModelFile) -> PathBuf {
    local_dir(models_root, file).join(file.file_name())
}

/// The Hugging Face URL the file is downloaded from.
pub(super) fn download_url(file: &ModelFile) -> String {
    format!(
        "https://huggingface.co/{}/resolve/main/{}",
        file.repo, file.path_in_repo
    )
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::super::test_support::Scratch;
    use super::*;
    use crate::commands::download::validate_file_name;

    #[test]
    fn every_recipe_has_a_licence_files_and_positive_sizes() {
        for recipe in RECIPES {
            assert!(!recipe.license.is_empty(), "{} has no licence", recipe.id);
            assert!(
                !recipe.license_url.is_empty(),
                "{} has no licence URL",
                recipe.id
            );
            assert!(!recipe.files.is_empty(), "{} has no files", recipe.id);
            assert!(recipe.files.iter().any(|f| f.role == ModelRole::Model));
            for file in recipe.files {
                assert!(
                    file.size_bytes > 0,
                    "{} has an empty size",
                    file.path_in_repo
                );
            }
        }
    }

    #[test]
    fn recipe_ids_are_unique_and_findable() {
        for recipe in RECIPES {
            assert_eq!(find_recipe(recipe.id).map(|r| r.id), Ok(recipe.id));
        }
        let mut ids: Vec<&str> = RECIPES.iter().map(|r| r.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), RECIPES.len());
        assert!(find_recipe("../etc/passwd").is_err());
    }

    #[test]
    fn local_names_are_safe_and_one_file_per_repo_name() {
        let mut seen: HashMap<(String, &str), &str> = HashMap::new();
        for recipe in RECIPES {
            for file in recipe.files {
                validate_file_name(file.file_name()).expect("safe file name");
                let key = (file.repo.replace('/', "--"), file.file_name());
                let previous = seen.insert(key, file.path_in_repo);
                assert!(
                    previous.is_none_or(|p| p == file.path_in_repo),
                    "{} would overwrite another file",
                    file.file_name()
                );
            }
        }
    }

    #[test]
    fn flags_cover_exactly_the_roles_the_recipe_has() {
        for recipe in RECIPES {
            for (flag, role) in recipe.flags {
                assert!(flag.starts_with('-'), "{flag} is not an option");
                assert!(
                    recipe.files.iter().any(|f| f.role == *role),
                    "{} has a {flag} flag but no {role:?} file",
                    recipe.id
                );
            }
            for file in recipe.files {
                assert!(
                    recipe.flags.iter().any(|(_, role)| *role == file.role),
                    "{} has a {:?} file with no flag",
                    recipe.id,
                    file.role
                );
            }
        }
    }

    #[test]
    fn the_text_encoder_is_one_local_file_for_both_flux_and_z_image() {
        let root = Path::new("models");
        let flux = find_recipe("flux2-klein-4b-q4").expect("flux");
        let zimage = find_recipe("z-image-turbo-q4").expect("z-image");
        let llm_of = |recipe: &ImageRecipe| {
            recipe
                .local_paths(root)
                .into_iter()
                .find(|(role, _)| *role == ModelRole::Llm)
                .map(|(_, path)| path)
        };
        assert!(llm_of(flux).is_some());
        assert_eq!(llm_of(flux), llm_of(zimage));
    }

    #[test]
    fn download_url_is_the_hugging_face_resolve_path() {
        let file = &SD15_Q4.files[0];
        assert_eq!(
            download_url(file),
            "https://huggingface.co/gpustack/stable-diffusion-v1-5-GGUF/resolve/main/stable-diffusion-v1-5-Q4_0.gguf"
        );
    }

    #[test]
    fn describe_reports_which_files_are_present() {
        let scratch = Scratch::new("catalog-describe");
        let root = scratch.path();
        let recipe = find_recipe("sd15-q4").expect("sd15");

        let empty = describe(recipe, root);
        assert!(!empty.downloaded);
        assert!(empty.files.iter().all(|f| !f.present));
        assert_eq!(empty.total_bytes, recipe.files[0].size_bytes);

        let path = local_path(root, &recipe.files[0]);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("dir");
        std::fs::write(&path, b"gguf").expect("file");
        let full = describe(recipe, root);
        assert!(full.downloaded);
        assert!(is_downloaded(recipe, root));
    }

    #[test]
    fn listing_serialises_with_the_camel_case_contract() {
        let scratch = Scratch::new("catalog-json");
        let json = serde_json::to_value(describe(
            find_recipe("sd15-q4").expect("sd15"),
            scratch.path(),
        ))
        .expect("json");
        for key in [
            "id",
            "name",
            "description",
            "license",
            "licenseUrl",
            "totalBytes",
            "downloaded",
            "files",
            "defaults",
            "supportsNegativePrompt",
            "cfgAdjustable",
        ] {
            assert!(json.get(key).is_some(), "missing {key}");
        }
        assert_eq!(
            json["files"][0]["fileName"],
            "stable-diffusion-v1-5-Q4_0.gguf"
        );
        assert_eq!(json["files"][0]["sizeBytes"], 1_747_190_784u64);
        assert_eq!(json["files"][0]["present"], false);
        assert_eq!(json["defaults"]["cfgScale"], 7.0);
        assert_eq!(json["defaults"]["steps"], 20);
        assert_eq!(json["supportsNegativePrompt"], true);
        assert_eq!(json["cfgAdjustable"], true);
        assert_eq!(json["imageInput"], "init");
    }

    #[test]
    fn each_model_says_what_it_does_with_an_input_image() {
        let expected = [
            ("sd15-q4", ImageInput::Init),
            ("flux2-klein-4b-q4", ImageInput::Reference),
            ("z-image-turbo-q4", ImageInput::None),
        ];
        for (id, input) in expected {
            assert_eq!(find_recipe(id).expect("recipe").image_input, input, "{id}");
        }
    }

    #[test]
    fn image_input_serialises_as_the_frontend_words() {
        assert_eq!(serde_json::json!(ImageInput::None), "none");
        assert_eq!(serde_json::json!(ImageInput::Init), "init");
        assert_eq!(serde_json::json!(ImageInput::Reference), "reference");
    }

    #[test]
    fn distilled_models_fix_cfg_and_take_no_negative_prompt() {
        for id in ["flux2-klein-4b-q4", "z-image-turbo-q4"] {
            let recipe = find_recipe(id).expect("distilled recipe");
            assert!(!recipe.supports_negative_prompt, "{id}");
            assert!(!recipe.cfg_adjustable, "{id}");
        }
        let sd15 = find_recipe("sd15-q4").expect("sd15");
        assert!(sd15.supports_negative_prompt);
        assert!(sd15.cfg_adjustable);
    }
}
