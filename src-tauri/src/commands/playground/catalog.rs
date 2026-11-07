//! The curated text-to-image models: the Hugging Face files each one needs, the sd-cli flags that
//! load them, and the defaults the Playground starts with.
//!
//! Files are stored per repo under `<models root>/<owner--repo>/<file name>`, so a file shared by two
//! recipes (the Qwen3 text encoder) is downloaded and kept once.

use std::path::{Path, PathBuf};

use serde::Serialize;

use super::model_links::ModelLinks;

/// The Apache 2.0 licence text, shown on a model card. Image and speech models both use it.
pub(super) const APACHE_LICENSE_URL: &str = "https://www.apache.org/licenses/LICENSE-2.0";
const SD15_LICENSE_URL: &str = "https://huggingface.co/spaces/CompVis/stable-diffusion-license";
const SD_TURBO_LICENSE_URL: &str =
    "https://huggingface.co/stabilityai/sd-turbo/blob/main/LICENSE.md";
const SDXL_TURBO_LICENSE_URL: &str =
    "https://huggingface.co/stabilityai/sdxl-turbo/blob/main/LICENSE.md";
const SDXL_LICENSE_URL: &str =
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md";
const FLUX2_KLEIN_9B_LICENSE_URL: &str =
    "https://huggingface.co/black-forest-labs/FLUX.2-klein-9B/blob/main/LICENSE.md";

/// What a model file is for. A recipe's `flags` map each role to the sd-cli flag that loads it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ModelRole {
    /// The diffusion model (or the full checkpoint for Stable Diffusion 1.x).
    Model,
    Vae,
    /// The text encoder.
    Llm,
    /// The CLIP-L text encoder (sd-cli `--clip_l`), used with the T5-XXL encoder by FLUX.1.
    ClipL,
    /// The T5-XXL text encoder (sd-cli `--t5xxl`), used with CLIP-L by FLUX.1.
    T5xxl,
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
    /// Where the model comes from, and where its card and docs are.
    pub links: ModelLinks,
}

/// The FLUX.1 autoencoder used by FLUX.1 schnell. The Black Forest Labs file is gated, so this is the
/// same 335,304,388-byte `ae.safetensors` from Comfy-Org's Apache 2.0 repack.
const FLUX1_AE: ModelFile = ModelFile {
    repo: "Comfy-Org/Lumina-Image-2",
    path_in_repo: "split_files/vae/ae.safetensors",
    size_bytes: 335_304_388,
    role: ModelRole::Vae,
};

/// The CLIP-L text encoder used by FLUX.1 schnell.
const CLIP_L: ModelFile = ModelFile {
    repo: "comfyanonymous/flux_text_encoders",
    path_in_repo: "clip_l.safetensors",
    size_bytes: 246_144_152,
    role: ModelRole::ClipL,
};

/// The T5-XXL text encoder used by FLUX.1 schnell, in fp8 to keep it smaller than fp16.
const T5XXL_FP8: ModelFile = ModelFile {
    repo: "comfyanonymous/flux_text_encoders",
    path_in_repo: "t5xxl_fp8_e4m3fn.safetensors",
    size_bytes: 4_893_934_904,
    role: ModelRole::T5xxl,
};

/// The Qwen3 4B text encoder used by FLUX.2 klein 4B, Z-Image Turbo and Z-Image. One copy on disk.
const QWEN3_4B_LLM: ModelFile = ModelFile {
    repo: "unsloth/Qwen3-4B-GGUF",
    path_in_repo: "Qwen3-4B-Q4_K_M.gguf",
    size_bytes: 2_497_281_312,
    role: ModelRole::Llm,
};

/// The Qwen3 8B text encoder used by FLUX.2 klein 9B.
const QWEN3_8B_LLM: ModelFile = ModelFile {
    repo: "unsloth/Qwen3-8B-GGUF",
    path_in_repo: "Qwen3-8B-Q4_K_M.gguf",
    size_bytes: 5_027_784_512,
    role: ModelRole::Llm,
};

/// The VAE used by Z-Image Turbo and Z-Image. One copy on disk.
const Z_IMAGE_VAE: ModelFile = ModelFile {
    repo: "wbruna/Z-Image-Turbo-sdcpp-GGUF",
    path_in_repo: "ae-f16.gguf",
    size_bytes: 167_656_704,
    role: ModelRole::Vae,
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
    links: ModelLinks {
        card_repo: Some("stable-diffusion-v1-5/stable-diffusion-v1-5"),
        source_url: "https://huggingface.co/gpustack/stable-diffusion-v1-5-GGUF",
        docs_url: Some("https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/sd.md"),
    },
};

// The Turbo models are distilled to run in one to four steps at CFG 1.0 with no negative prompt, so
// their defaults are fixed the same way as the other distilled recipes. Their default is two steps.
const SD_TURBO_Q4: ImageRecipe = ImageRecipe {
    id: "sd-turbo-q4",
    name: "SD-Turbo (Q4)",
    description: "Fast: a 512 px Stable Diffusion Turbo checkpoint, quantised to 4 bits, that makes a picture in one to four steps, good for quick sketches; about 1.9 GB to download and roughly 2.5 GB of RAM.",
    license: "Stability AI Community License Agreement",
    license_url: SD_TURBO_LICENSE_URL,
    files: &[ModelFile {
        repo: "samoudi/sd-turbo-gguf",
        path_in_repo: "sd_turbo_q4_0.gguf",
        size_bytes: 1_847_909_248,
        role: ModelRole::Model,
    }],
    flags: &[("-m", ModelRole::Model)],
    defaults: ImageDefaults {
        width: 512,
        height: 512,
        steps: 2,
        cfg_scale: 1.0,
    },
    supports_negative_prompt: false,
    cfg_adjustable: false,
    image_input: ImageInput::Init,
    links: ModelLinks {
        card_repo: Some("stabilityai/sd-turbo"),
        source_url: "https://huggingface.co/samoudi/sd-turbo-gguf",
        docs_url: Some("https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/distilled_sd.md"),
    },
};

const SDXL_BASE_Q4: ImageRecipe = ImageRecipe {
    id: "sdxl-base-q4",
    name: "SDXL base 1.0 (Q4)",
    description: "Balanced: the 1024 px SDXL base 1.0 checkpoint, quantised to 4 bits, for detailed pictures with a negative prompt; about 3.9 GB to download and roughly 5 GB of RAM.",
    license: "CreativeML Open RAIL++-M License",
    license_url: SDXL_LICENSE_URL,
    files: &[ModelFile {
        repo: "gpustack/stable-diffusion-xl-base-1.0-GGUF",
        path_in_repo: "stable-diffusion-xl-base-1.0-Q4_0.gguf",
        size_bytes: 3_940_010_720,
        role: ModelRole::Model,
    }],
    flags: &[("-m", ModelRole::Model)],
    defaults: ImageDefaults {
        width: 1024,
        height: 1024,
        steps: 20,
        cfg_scale: 7.0,
    },
    supports_negative_prompt: true,
    cfg_adjustable: true,
    image_input: ImageInput::Init,
    links: ModelLinks {
        card_repo: Some("stabilityai/stable-diffusion-xl-base-1.0"),
        source_url: "https://huggingface.co/gpustack/stable-diffusion-xl-base-1.0-GGUF",
        docs_url: Some("https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/sd.md"),
    },
};

// SDXL-Turbo runs at 512 px like SD-Turbo, with the same fixed one-to-four-step defaults.
const SDXL_TURBO_Q8: ImageRecipe = ImageRecipe {
    id: "sdxl-turbo-q8",
    name: "SDXL-Turbo (Q8)",
    description: "Balanced: the 512 px SDXL Turbo checkpoint, quantised to 8 bits, that makes a picture in one to four steps; about 4.1 GB to download and roughly 6 GB of RAM.",
    license: "Stability AI Community License Agreement",
    license_url: SDXL_TURBO_LICENSE_URL,
    files: &[ModelFile {
        repo: "OlegSkutte/sdxl-turbo-GGUF",
        path_in_repo: "sd_xl_turbo_1.0.q8_0.gguf",
        size_bytes: 4_098_988_672,
        role: ModelRole::Model,
    }],
    flags: &[("-m", ModelRole::Model)],
    defaults: ImageDefaults {
        width: 512,
        height: 512,
        steps: 2,
        cfg_scale: 1.0,
    },
    supports_negative_prompt: false,
    cfg_adjustable: false,
    image_input: ImageInput::Init,
    links: ModelLinks {
        card_repo: Some("stabilityai/sdxl-turbo"),
        source_url: "https://huggingface.co/OlegSkutte/sdxl-turbo-GGUF",
        docs_url: Some("https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/distilled_sd.md"),
    },
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
    links: ModelLinks {
        card_repo: Some("black-forest-labs/FLUX.2-klein-4B"),
        source_url: "https://huggingface.co/leejet/FLUX.2-klein-4B-GGUF",
        docs_url: Some("https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md"),
    },
};

const FLUX2_KLEIN_9B_Q4: ImageRecipe = ImageRecipe {
    id: "flux2-klein-9b-q4",
    name: "FLUX.2 klein 9B (Q4)",
    description: "A 9 billion parameter FLUX.2 model, quantised to 4 bits, for more detailed images than the 4B; heavier, at about 10.2 GB to download and roughly 11 GB of RAM.",
    license: "FLUX Non-Commercial License",
    license_url: FLUX2_KLEIN_9B_LICENSE_URL,
    files: &[
        ModelFile {
            repo: "leejet/FLUX.2-klein-9B-GGUF",
            path_in_repo: "flux-2-klein-9b-Q4_0.gguf",
            size_bytes: 5_616_208_032,
            role: ModelRole::Model,
        },
        ModelFile {
            repo: "Comfy-Org/Flux-2-Klein-4B",
            path_in_repo: "split_files/vae/flux2-vae.safetensors",
            size_bytes: 336_211_292,
            role: ModelRole::Vae,
        },
        QWEN3_8B_LLM,
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
    links: ModelLinks {
        card_repo: Some("black-forest-labs/FLUX.2-klein-9B"),
        source_url: "https://huggingface.co/leejet/FLUX.2-klein-9B-GGUF",
        docs_url: Some("https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux2.md"),
    },
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
        Z_IMAGE_VAE,
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
    links: ModelLinks {
        card_repo: Some("Tongyi-MAI/Z-Image-Turbo"),
        source_url: "https://huggingface.co/leejet/Z-Image-Turbo-GGUF",
        docs_url: Some(
            "https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/z_image.md",
        ),
    },
};

const Z_IMAGE_Q4: ImageRecipe = ImageRecipe {
    id: "z-image-q4",
    name: "Z-Image (Q4)",
    description: "The undistilled Z-Image base model, quantised to 4 bits, for varied images with a negative prompt and adjustable CFG; slower than Turbo, at about 6.8 GB to download and roughly 8 GB of RAM.",
    license: "Apache-2.0",
    license_url: APACHE_LICENSE_URL,
    files: &[
        ModelFile {
            repo: "unsloth/Z-Image-GGUF",
            path_in_repo: "z-image-Q4_0.gguf",
            size_bytes: 4_585_244_736,
            role: ModelRole::Model,
        },
        Z_IMAGE_VAE,
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
        steps: 28,
        cfg_scale: 5.0,
    },
    supports_negative_prompt: true,
    cfg_adjustable: true,
    image_input: ImageInput::None,
    links: ModelLinks {
        card_repo: Some("Tongyi-MAI/Z-Image"),
        source_url: "https://huggingface.co/unsloth/Z-Image-GGUF",
        docs_url: Some("https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/z_image.md"),
    },
};

const FLUX1_SCHNELL_Q4: ImageRecipe = ImageRecipe {
    id: "flux1-schnell-q4",
    name: "FLUX.1 schnell (Q4)",
    description: "Balanced: a 12 billion parameter FLUX.1 model, quantised to 4 bits, that makes good images in four steps; about 12.2 GB to download and roughly 7 GB of RAM.",
    license: "Apache-2.0",
    license_url: APACHE_LICENSE_URL,
    files: &[
        ModelFile {
            repo: "city96/FLUX.1-schnell-gguf",
            path_in_repo: "flux1-schnell-Q4_0.gguf",
            size_bytes: 6_770_707_360,
            role: ModelRole::Model,
        },
        FLUX1_AE,
        CLIP_L,
        T5XXL_FP8,
    ],
    flags: &[
        ("--diffusion-model", ModelRole::Model),
        ("--vae", ModelRole::Vae),
        ("--clip_l", ModelRole::ClipL),
        ("--t5xxl", ModelRole::T5xxl),
    ],
    defaults: ImageDefaults {
        width: 512,
        height: 512,
        steps: 4,
        cfg_scale: 1.0,
    },
    supports_negative_prompt: false,
    cfg_adjustable: false,
    image_input: ImageInput::None,
    links: ModelLinks {
        card_repo: Some("black-forest-labs/FLUX.1-schnell"),
        source_url: "https://huggingface.co/city96/FLUX.1-schnell-gguf",
        docs_url: Some("https://github.com/leejet/stable-diffusion.cpp/blob/master/docs/flux.md"),
    },
};

/// Every curated model, in the order the Playground lists them.
pub(super) const RECIPES: &[ImageRecipe] = &[
    SD15_Q4,
    SD_TURBO_Q4,
    SDXL_BASE_Q4,
    SDXL_TURBO_Q8,
    FLUX2_KLEIN_4B_Q4,
    FLUX2_KLEIN_9B_Q4,
    Z_IMAGE_TURBO_Q4,
    Z_IMAGE_Q4,
    FLUX1_SCHNELL_Q4,
];

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
    pub links: ModelLinks,
}

/// One file of a listed model.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageModelFile {
    pub file_name: &'static str,
    pub size_bytes: u64,
    pub present: bool,
    /// The Hugging Face repo the file is downloaded from.
    pub source: &'static str,
}

/// The listing entry for `recipe`, checking each file under `models_root`.
pub(super) fn describe(recipe: &'static ImageRecipe, models_root: &Path) -> ImageModel {
    let files: Vec<ImageModelFile> = recipe
        .files
        .iter()
        .map(|file| ImageModelFile {
            file_name: file.file_name(),
            source: file.repo,
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
        links: recipe.links,
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
    fn klein_9b_uses_the_8b_encoder_and_the_shared_vae() {
        let klein_4b = find_recipe("flux2-klein-4b-q4").expect("4b");
        let klein_9b = find_recipe("flux2-klein-9b-q4").expect("9b");
        let encoder = klein_9b
            .files
            .iter()
            .find(|file| file.role == ModelRole::Llm)
            .map(|file| file.file_name());
        assert_eq!(encoder, Some("Qwen3-8B-Q4_K_M.gguf"));
        let root = Path::new("models");
        let vae_of = |recipe: &ImageRecipe| {
            recipe
                .local_paths(root)
                .into_iter()
                .find(|(role, _)| *role == ModelRole::Vae)
                .map(|(_, path)| path)
        };
        assert_eq!(vae_of(klein_4b), vae_of(klein_9b));
    }

    #[test]
    fn z_image_base_shares_the_turbo_vae_and_encoder() {
        let turbo = find_recipe("z-image-turbo-q4").expect("turbo");
        let base = find_recipe("z-image-q4").expect("base");
        for role in [ModelRole::Vae, ModelRole::Llm] {
            let path_of = |recipe: &ImageRecipe| {
                recipe
                    .local_paths(Path::new("models"))
                    .into_iter()
                    .find(|(r, _)| *r == role)
                    .map(|(_, path)| path)
            };
            assert_eq!(path_of(turbo), path_of(base), "{role:?}");
        }
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
            ("sd-turbo-q4", ImageInput::Init),
            ("sdxl-base-q4", ImageInput::Init),
            ("sdxl-turbo-q8", ImageInput::Init),
            ("flux2-klein-4b-q4", ImageInput::Reference),
            ("flux2-klein-9b-q4", ImageInput::Reference),
            ("z-image-turbo-q4", ImageInput::None),
            ("z-image-q4", ImageInput::None),
            ("flux1-schnell-q4", ImageInput::None),
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
        for id in [
            "sd-turbo-q4",
            "sdxl-turbo-q8",
            "flux2-klein-4b-q4",
            "flux2-klein-9b-q4",
            "z-image-turbo-q4",
            "flux1-schnell-q4",
        ] {
            let recipe = find_recipe(id).expect("distilled recipe");
            assert!(!recipe.supports_negative_prompt, "{id}");
            assert!(!recipe.cfg_adjustable, "{id}");
        }
        for id in ["sd15-q4", "sdxl-base-q4", "z-image-q4"] {
            let recipe = find_recipe(id).expect("undistilled recipe");
            assert!(recipe.supports_negative_prompt, "{id}");
            assert!(recipe.cfg_adjustable, "{id}");
        }
    }

    #[test]
    fn flux1_schnell_loads_two_text_encoders_and_the_autoencoder() {
        let recipe = find_recipe("flux1-schnell-q4").expect("schnell");
        let roles: Vec<ModelRole> = recipe.flags.iter().map(|(_, role)| *role).collect();
        assert_eq!(
            roles,
            [
                ModelRole::Model,
                ModelRole::Vae,
                ModelRole::ClipL,
                ModelRole::T5xxl
            ]
        );
        assert!(recipe.files.iter().all(|file| file.role != ModelRole::Llm));
        let names: Vec<&str> = recipe.files.iter().map(|file| file.file_name()).collect();
        assert_eq!(
            names,
            [
                "flux1-schnell-Q4_0.gguf",
                "ae.safetensors",
                "clip_l.safetensors",
                "t5xxl_fp8_e4m3fn.safetensors",
            ]
        );
        assert!(recipe.description.starts_with("Balanced"));
        assert_eq!(recipe.defaults.steps, 4);
        assert_eq!(recipe.defaults.cfg_scale, 1.0);
    }

    #[test]
    fn sd_and_sdxl_turbo_are_single_checkpoints_with_fixed_turbo_defaults() {
        for (id, tier) in [("sd-turbo-q4", "Fast"), ("sdxl-turbo-q8", "Balanced")] {
            let recipe = find_recipe(id).expect("turbo recipe");
            assert_eq!(recipe.files.len(), 1, "{id} is one checkpoint");
            assert_eq!(recipe.files[0].role, ModelRole::Model, "{id}");
            assert_eq!(recipe.flags, &[("-m", ModelRole::Model)], "{id}");
            assert!(recipe.description.starts_with(tier), "{id}");
            assert_eq!(recipe.defaults.width, 512, "{id}");
            assert_eq!(recipe.defaults.height, 512, "{id}");
            assert_eq!(recipe.defaults.steps, 2, "{id}");
            assert_eq!(recipe.defaults.cfg_scale, 1.0, "{id}");
            assert_eq!(
                recipe.license, "Stability AI Community License Agreement",
                "{id}"
            );
        }
    }

    #[test]
    fn sdxl_base_is_a_1024_px_checkpoint_with_a_negative_prompt() {
        let recipe = find_recipe("sdxl-base-q4").expect("sdxl base");
        assert_eq!(recipe.files.len(), 1);
        assert_eq!(recipe.flags, &[("-m", ModelRole::Model)]);
        assert!(recipe.description.starts_with("Balanced"));
        assert_eq!(recipe.defaults.width, 1024);
        assert_eq!(recipe.defaults.height, 1024);
        assert_eq!(recipe.defaults.steps, 20);
        assert_eq!(recipe.defaults.cfg_scale, 7.0);
        assert_eq!(recipe.license, "CreativeML Open RAIL++-M License");
    }

    #[test]
    fn flux1_schnell_encoders_live_in_the_shared_text_encoder_repo() {
        let recipe = find_recipe("flux1-schnell-q4").expect("schnell");
        let root = Path::new("models");
        let path_of = |role: ModelRole| {
            recipe
                .local_paths(root)
                .into_iter()
                .find(|(r, _)| *r == role)
                .map(|(_, path)| path)
        };
        assert_eq!(
            path_of(ModelRole::ClipL),
            Some(
                root.join("comfyanonymous--flux_text_encoders")
                    .join("clip_l.safetensors")
            )
        );
        assert_eq!(
            path_of(ModelRole::T5xxl),
            Some(
                root.join("comfyanonymous--flux_text_encoders")
                    .join("t5xxl_fp8_e4m3fn.safetensors")
            )
        );
        assert_eq!(path_of(ModelRole::Llm), None);
    }

    #[test]
    fn every_recipe_links_to_its_card_source_and_docs() {
        for recipe in RECIPES {
            super::super::model_links::assert_well_formed(recipe.id, &recipe.links);
        }
    }

    #[test]
    fn the_listing_carries_the_links_and_each_file_its_repo() {
        let scratch = Scratch::new("catalog-links");
        let recipe = find_recipe("flux2-klein-4b-q4").expect("flux");
        let listed = describe(recipe, scratch.path());
        assert_eq!(listed.links, recipe.links);
        assert_eq!(listed.files[0].source, recipe.files[0].repo);
        let json = serde_json::to_value(&listed).expect("json");
        assert_eq!(json["links"]["sourceUrl"], recipe.links.source_url);
        assert_eq!(json["files"][0]["source"], recipe.files[0].repo);
    }
}
