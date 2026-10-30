//! The curated audio models: speech denoisers and a 2-stem source separator. They run in the same
//! sherpa-onnx runtime as the speech models and sit in the same model list, under the same
//! `k2-fsa--sherpa-onnx` folder. Each one is a single `.onnx` file or the `.tar.bz2` of a folder.

use super::speech_catalog::{Delivery, Engine, SpeechRecipe};

/// Release tag of the single-file speech enhancement models.
pub(super) const SPEECH_ENHANCEMENT_TAG: &str = "speech-enhancement-models";
/// Release tag of the source separation models.
pub(super) const SOURCE_SEPARATION_TAG: &str = "source-separation-models";
const GTCRN_LICENSE_URL: &str = "https://github.com/Xiaobin-Rong/gtcrn/blob/main/LICENSE";
const DPDFNET_LICENSE_URL: &str = "https://github.com/ceva-ip/DPDFNet/blob/main/LICENSE";
const SPLEETER_LICENSE_URL: &str = "https://github.com/deezer/spleeter/blob/master/LICENSE";

/// A denoiser and the sherpa-onnx flag that loads it.
#[derive(Debug, Clone, Copy)]
pub(super) enum DenoiseEngine {
    /// GTCRN: one model file.
    Gtcrn { model: &'static str },
    /// DPDFNet: one model file.
    DpdfNet { model: &'static str },
}

impl DenoiseEngine {
    /// The model file, relative to the model folder.
    pub(super) fn model_file(self) -> &'static str {
        match self {
            DenoiseEngine::Gtcrn { model } | DenoiseEngine::DpdfNet { model } => model,
        }
    }
}

/// A source separator and the sherpa-onnx flags that load it.
#[derive(Debug, Clone, Copy)]
pub(super) enum SeparateEngine {
    /// Spleeter: a vocals model and an accompaniment model.
    Spleeter {
        vocals: &'static str,
        accompaniment: &'static str,
    },
}

impl SeparateEngine {
    /// The model files, relative to the model folder: vocals first, then accompaniment.
    pub(super) fn model_files(self) -> [&'static str; 2] {
        match self {
            SeparateEngine::Spleeter {
                vocals,
                accompaniment,
            } => [vocals, accompaniment],
        }
    }
}

const GTCRN_SIMPLE: SpeechRecipe = SpeechRecipe {
    id: "gtcrn-simple",
    name: "GTCRN simple (denoise)",
    description: "A tiny speech denoiser, 0.5 MB, quick on the CPU. Output is 16 kHz mono.",
    license: "MIT",
    license_url: GTCRN_LICENSE_URL,
    delivery: Delivery::SingleFile {
        file_name: "gtcrn_simple.onnx",
    },
    release_tag: SPEECH_ENHANCEMENT_TAG,
    size_bytes: 535_638,
    languages: &["any"],
    engine: Engine::Denoise(DenoiseEngine::Gtcrn {
        model: "gtcrn_simple.onnx",
    }),
    speakers: &[],
};

const DPDFNET4: SpeechRecipe = SpeechRecipe {
    id: "dpdfnet4",
    name: "DPDFNet4 (denoise)",
    description: "A larger speech denoiser than GTCRN, 11.7 MB. Output is 16 kHz mono.",
    license: "Apache-2.0",
    license_url: DPDFNET_LICENSE_URL,
    delivery: Delivery::SingleFile {
        file_name: "dpdfnet4.onnx",
    },
    release_tag: SPEECH_ENHANCEMENT_TAG,
    size_bytes: 11_707_436,
    languages: &["any"],
    engine: Engine::Denoise(DenoiseEngine::DpdfNet {
        model: "dpdfnet4.onnx",
    }),
    speakers: &[],
};

const SPLEETER_2STEMS_INT8: SpeechRecipe = SpeechRecipe {
    id: "spleeter-2stems-int8",
    name: "Spleeter 2 stems (int8)",
    description: "Splits a mix into voice, and music and other sounds. Output has the input's sample rate and channels. Pretrained weights: licence not verified.",
    license: "MIT (code only)",
    license_url: SPLEETER_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-spleeter-2stems-int8.tar.bz2",
    },
    release_tag: SOURCE_SEPARATION_TAG,
    size_bytes: 48_623_481,
    languages: &[],
    engine: Engine::Separate(SeparateEngine::Spleeter {
        vocals: "vocals.int8.onnx",
        accompaniment: "accompaniment.int8.onnx",
    }),
    speakers: &[],
};

/// Every curated audio model, in the order the Playground lists them.
pub(super) const RECIPES: &[SpeechRecipe] = &[GTCRN_SIMPLE, DPDFNET4, SPLEETER_2STEMS_INT8];

#[cfg(test)]
mod tests {
    use super::super::speech_catalog::{self, SpeechKind};
    use super::super::test_support::Scratch;
    use super::*;

    #[test]
    fn the_audio_models_have_the_kinds_and_engines_they_declare() {
        for recipe in RECIPES {
            assert!(
                matches!(recipe.kind(), SpeechKind::Denoise | SpeechKind::Separate),
                "{} is not an audio model",
                recipe.id
            );
        }
        assert_eq!(GTCRN_SIMPLE.kind(), SpeechKind::Denoise);
        assert_eq!(DPDFNET4.kind(), SpeechKind::Denoise);
        assert_eq!(SPLEETER_2STEMS_INT8.kind(), SpeechKind::Separate);
    }

    #[test]
    fn the_audio_models_offer_no_voices() {
        for recipe in RECIPES {
            assert!(recipe.voices().is_empty(), "{}", recipe.id);
        }
    }

    #[test]
    fn denoisers_name_their_one_model_file() {
        assert_eq!(GTCRN_SIMPLE.engine.entries(), vec!["gtcrn_simple.onnx"]);
        assert_eq!(DPDFNET4.engine.entries(), vec!["dpdfnet4.onnx"]);
    }

    #[test]
    fn the_separator_names_its_vocals_and_accompaniment_files() {
        assert_eq!(
            SPLEETER_2STEMS_INT8.engine.entries(),
            vec!["vocals.int8.onnx", "accompaniment.int8.onnx"]
        );
    }

    #[test]
    fn a_single_file_model_keeps_its_file_under_the_asset_name() {
        for recipe in [&GTCRN_SIMPLE, &DPDFNET4] {
            let Delivery::SingleFile { file_name } = recipe.delivery else {
                panic!("{} should be a single file", recipe.id);
            };
            assert_eq!(recipe.asset_name(), file_name);
            assert_eq!(recipe.engine.entries(), vec![file_name]);
            assert!(file_name.ends_with(".onnx"), "{file_name}");
        }
    }

    #[test]
    fn the_separator_is_an_archive_that_unpacks_to_its_two_files() {
        assert_eq!(
            SPLEETER_2STEMS_INT8.delivery,
            Delivery::Archive {
                archive_name: "sherpa-onnx-spleeter-2stems-int8.tar.bz2"
            }
        );
    }

    #[test]
    fn the_sizes_are_the_github_sizes() {
        assert_eq!(GTCRN_SIMPLE.size_bytes, 535_638);
        assert_eq!(DPDFNET4.size_bytes, 11_707_436);
        assert_eq!(SPLEETER_2STEMS_INT8.size_bytes, 48_623_481);
    }

    #[test]
    fn the_licence_of_each_card_is_named_with_its_url() {
        assert_eq!(GTCRN_SIMPLE.license, "MIT");
        assert_eq!(DPDFNET4.license, "Apache-2.0");
        assert!(SPLEETER_2STEMS_INT8.license.starts_with("MIT"));
        assert!(
            SPLEETER_2STEMS_INT8
                .description
                .contains("licence not verified"),
            "the unverified weights licence is said on the card"
        );
        for recipe in RECIPES {
            assert!(recipe.license_url.starts_with("https://github.com/"));
        }
    }

    #[test]
    fn every_audio_download_is_on_the_allowlist_and_has_the_right_tag() {
        for recipe in RECIPES {
            let url = speech_catalog::download_url(recipe);
            assert!(speech_catalog::is_allowed_speech_url(&url), "{url}");
        }
        assert_eq!(
            speech_catalog::download_url(&SPLEETER_2STEMS_INT8),
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/source-separation-models/sherpa-onnx-spleeter-2stems-int8.tar.bz2"
        );
    }

    #[test]
    fn a_downloaded_separator_is_found_after_its_archive_unpacks() {
        let scratch = Scratch::new("audio-downloaded");
        let root = scratch.path();
        let folder = speech_catalog::model_dir(root, &SPLEETER_2STEMS_INT8);
        std::fs::create_dir_all(&folder).expect("folder");
        std::fs::write(folder.join("vocals.int8.onnx"), b"x").expect("vocals");
        assert!(!speech_catalog::is_downloaded(&SPLEETER_2STEMS_INT8, root));
        std::fs::write(folder.join("accompaniment.int8.onnx"), b"x").expect("accompaniment");
        assert!(speech_catalog::is_downloaded(&SPLEETER_2STEMS_INT8, root));
    }
}
