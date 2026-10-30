//! The curated image upscaling models: single `.pth` files from GitHub releases that
//! stable-diffusion.cpp's upscale mode reads directly. Each is stored at
//! `<models root>/upscalers/<file name>`.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::commands::download::validate_file_name;

/// The folder under the models root that holds the upscaler files.
const UPSCALERS_DIR: &str = "upscalers";
/// Where the model files are downloaded from: `https://github.com/<owner>/<repo>/releases/download/<tag>/<file>`.
const GITHUB_PREFIX: &str = "https://github.com/";
/// The repositories the upscaler files may come from.
const ALLOWED_REPOS: &[&str] = &["xinntao/Real-ESRGAN", "Phhofm/models"];
/// The only file ending an upscaler may have.
const MODEL_EXTENSION: &str = ".pth";

/// One curated upscaler. Both models enlarge by a fixed factor of 4.
#[derive(Debug)]
pub(super) struct UpscaleRecipe {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub license_url: &'static str,
    pub url: &'static str,
    /// Size of the file in bytes. Checked after each download.
    pub size_bytes: u64,
    /// What kind of picture the model suits, in a short phrase.
    pub best_for: &'static str,
}

impl UpscaleRecipe {
    /// The last URL segment: the name the file has on disk.
    pub(super) fn file_name(&self) -> &'static str {
        self.url.rsplit('/').next().unwrap_or(self.url)
    }
}

const REALESRGAN_ANIME_6B: UpscaleRecipe = UpscaleRecipe {
    id: "realesrgan-x4plus-anime-6b",
    name: "Real-ESRGAN x4plus anime 6B",
    description: "A 4x upscaler tuned for illustrations and anime. Sharpens line art and flat colour.",
    license: "BSD-3-Clause",
    license_url: "https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE",
    url: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth",
    size_bytes: 17_938_799,
    best_for: "Illustrations and anime",
};

const NOMOS2_HQ_MOSR: UpscaleRecipe = UpscaleRecipe {
    id: "nomos2-hq-mosr-x4",
    name: "4xNomos2 hq MoSR",
    description: "A 4x upscaler for clean photographs that are not blurred, noisy or compressed.",
    license: "CC-BY (attribution; author writes CC-BY-0.4)",
    license_url: "https://github.com/Phhofm/models/releases/tag/4xNomos2_hq_mosr",
    url: "https://github.com/Phhofm/models/releases/download/4xNomos2_hq_mosr/4xNomos2_hq_mosr.pth",
    size_bytes: 17_213_494,
    best_for: "Photographs of non-degraded input",
};

/// Every curated upscaler, in the order the Playground lists them.
pub(super) const RECIPES: &[UpscaleRecipe] = &[REALESRGAN_ANIME_6B, NOMOS2_HQ_MOSR];

/// The recipe with this id, or an error for an id that is not in the catalogue.
pub(super) fn find_recipe(id: &str) -> Result<&'static UpscaleRecipe, String> {
    RECIPES
        .iter()
        .find(|recipe| recipe.id == id)
        .ok_or_else(|| format!("Unknown upscaling model: {id}"))
}

/// An upscaler as the Playground lists it, with the state of its file on disk.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpscaleModel {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub license_url: &'static str,
    pub size_bytes: u64,
    pub downloaded: bool,
    pub best_for: &'static str,
}

/// The listing entry for `recipe`, checking its file under `models_root`.
pub(super) fn describe(recipe: &'static UpscaleRecipe, models_root: &Path) -> UpscaleModel {
    UpscaleModel {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        license: recipe.license,
        license_url: recipe.license_url,
        size_bytes: recipe.size_bytes,
        downloaded: is_downloaded(recipe, models_root),
        best_for: recipe.best_for,
    }
}

/// Where the model file is stored: `<models root>/upscalers/<file name>`.
pub(super) fn local_path(models_root: &Path, recipe: &UpscaleRecipe) -> PathBuf {
    models_root.join(UPSCALERS_DIR).join(recipe.file_name())
}

/// True when the model file is on disk.
pub(super) fn is_downloaded(recipe: &UpscaleRecipe, models_root: &Path) -> bool {
    local_path(models_root, recipe).is_file()
}

/// True for a `.pth` release asset of one of the `ALLOWED_REPOS`, with a plain file name and nothing
/// else in the path. Every other URL is refused.
pub(super) fn is_allowed_upscale_url(url: &str) -> bool {
    let Some(path) = url.strip_prefix(GITHUB_PREFIX) else {
        return false;
    };
    let parts: Vec<&str> = path.split('/').collect();
    let [owner, repo, "releases", "download", tag, file] = parts[..] else {
        return false;
    };
    ALLOWED_REPOS.contains(&format!("{owner}/{repo}").as_str())
        && !tag.is_empty()
        && file.ends_with(MODEL_EXTENSION)
        && validate_file_name(file).is_ok()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::super::test_support::Scratch;
    use super::*;

    #[test]
    fn ids_are_unique_and_findable() {
        let ids: HashSet<&str> = RECIPES.iter().map(|recipe| recipe.id).collect();
        assert_eq!(ids.len(), RECIPES.len());
        for recipe in RECIPES {
            assert_eq!(find_recipe(recipe.id).map(|r| r.id), Ok(recipe.id));
        }
        assert!(find_recipe("../etc/passwd").is_err());
    }

    #[test]
    fn ids_do_not_clash_with_image_or_speech_models() {
        for recipe in RECIPES {
            assert!(super::super::catalog::find_recipe(recipe.id).is_err());
            assert!(super::super::speech_catalog::find_recipe(recipe.id).is_err());
        }
    }

    #[test]
    fn every_recipe_has_a_licence_a_size_and_a_safe_allowed_pth_file() {
        for recipe in RECIPES {
            assert!(!recipe.license.is_empty() && !recipe.license_url.is_empty());
            assert!(recipe.size_bytes > 0);
            assert!(is_allowed_upscale_url(recipe.url), "{} url", recipe.id);
            validate_file_name(recipe.file_name()).expect("safe file name");
        }
        let names: HashSet<&str> = RECIPES.iter().map(|r| r.file_name()).collect();
        assert_eq!(names.len(), RECIPES.len(), "one file per model");
    }

    #[test]
    fn the_catalogue_matches_the_curated_models() {
        let anime = find_recipe("realesrgan-x4plus-anime-6b").expect("anime");
        assert_eq!(anime.size_bytes, 17_938_799);
        assert_eq!(anime.file_name(), "RealESRGAN_x4plus_anime_6B.pth");
        let nomos = find_recipe("nomos2-hq-mosr-x4").expect("nomos");
        assert_eq!(nomos.size_bytes, 17_213_494);
        assert_eq!(nomos.file_name(), "4xNomos2_hq_mosr.pth");
    }

    #[test]
    fn only_pth_assets_of_the_allowed_repos_pass_the_allowlist() {
        let good = "https://github.com/xinntao/Real-ESRGAN/releases/download/v1/a.pth";
        assert!(is_allowed_upscale_url(good));
        for bad in [
            "http://github.com/xinntao/Real-ESRGAN/releases/download/v1/a.pth",
            "https://github.com/evil/repo/releases/download/v1/a.pth",
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v1/a.exe",
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v1/sub/a.pth",
            "https://github.com/xinntao/Real-ESRGAN/releases/download/v1/../a.pth",
            "https://github.com/xinntao/Real-ESRGAN/raw/master/a.pth",
            "https://github.com.evil.com/xinntao/Real-ESRGAN/releases/download/v1/a.pth",
            "https://huggingface.co/xinntao/Real-ESRGAN/resolve/main/a.pth",
        ] {
            assert!(!is_allowed_upscale_url(bad), "{bad}");
        }
    }

    #[test]
    fn describe_reports_whether_the_file_is_on_disk() {
        let scratch = Scratch::new("upscale-describe");
        let recipe = find_recipe("nomos2-hq-mosr-x4").expect("nomos");
        assert!(!describe(recipe, scratch.path()).downloaded);

        let path = local_path(scratch.path(), recipe);
        std::fs::create_dir_all(path.parent().expect("parent")).expect("dir");
        std::fs::write(&path, b"pth").expect("file");
        assert!(describe(recipe, scratch.path()).downloaded);
    }

    #[test]
    fn listing_serialises_with_the_camel_case_contract() {
        let scratch = Scratch::new("upscale-json");
        let json = serde_json::to_value(describe(
            find_recipe("realesrgan-x4plus-anime-6b").expect("anime"),
            scratch.path(),
        ))
        .expect("json");
        for key in [
            "id",
            "name",
            "description",
            "license",
            "licenseUrl",
            "sizeBytes",
            "downloaded",
            "bestFor",
        ] {
            assert!(json.get(key).is_some(), "missing {key}");
        }
        assert_eq!(json["sizeBytes"], 17_938_799u64);
        assert_eq!(json["downloaded"], false);
        assert_eq!(json.as_object().expect("object").len(), 8);
    }
}
