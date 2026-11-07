//! The curated audio models: speech denoisers and a 2-stem source separator. They run in the same
//! sherpa-onnx runtime as the speech models and sit in the same model list, under the same
//! `k2-fsa--sherpa-onnx` folder. Each one is a single `.onnx` file or the `.tar.bz2` of a folder.

use super::model_links::ModelLinks;
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
    links: ModelLinks {
        card_repo: None,
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speech-enhancement-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/models.html"),
    },
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
    links: ModelLinks {
        card_repo: Some("ceva-ip/DPDFNet"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speech-enhancement-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/models.html"),
    },
};

const DPDFNET8: SpeechRecipe = SpeechRecipe {
    id: "dpdfnet8",
    name: "DPDFNet8 (denoise)",
    description: "The best quality of the 16 kHz DPDFNet denoisers, 14.6 MB. Larger and slower than DPDFNet4. Output is 16 kHz mono.",
    license: "Apache-2.0",
    license_url: DPDFNET_LICENSE_URL,
    delivery: Delivery::SingleFile {
        file_name: "dpdfnet8.onnx",
    },
    release_tag: SPEECH_ENHANCEMENT_TAG,
    size_bytes: 14_623_619,
    languages: &["any"],
    engine: Engine::Denoise(DenoiseEngine::DpdfNet {
        model: "dpdfnet8.onnx",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("ceva-ip/DPDFNet"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speech-enhancement-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/models.html"),
    },
};

const DPDFNET2_48KHZ_HR: SpeechRecipe = SpeechRecipe {
    id: "dpdfnet2-48khz-hr",
    name: "DPDFNet2 48 kHz (denoise)",
    description: "A DPDFNet denoiser for 48 kHz audio, 10.6 MB. A 16 kHz input is resampled up, and the output is 48 kHz mono.",
    license: "Apache-2.0",
    license_url: DPDFNET_LICENSE_URL,
    delivery: Delivery::SingleFile {
        file_name: "dpdfnet2_48khz_hr.onnx",
    },
    release_tag: SPEECH_ENHANCEMENT_TAG,
    size_bytes: 10_596_848,
    languages: &["any"],
    engine: Engine::Denoise(DenoiseEngine::DpdfNet {
        model: "dpdfnet2_48khz_hr.onnx",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("ceva-ip/DPDFNet"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speech-enhancement-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/models.html"),
    },
};

const DPDFNET_BASELINE: SpeechRecipe = SpeechRecipe {
    id: "dpdfnet-baseline",
    name: "DPDFNet baseline (denoise)",
    description: "Fast, the smallest DPDFNet denoiser, 8.8 MB. Output is 16 kHz mono.",
    license: "Apache-2.0",
    license_url: DPDFNET_LICENSE_URL,
    delivery: Delivery::SingleFile {
        file_name: "dpdfnet_baseline.onnx",
    },
    release_tag: SPEECH_ENHANCEMENT_TAG,
    size_bytes: 8_791_035,
    languages: &["any"],
    engine: Engine::Denoise(DenoiseEngine::DpdfNet {
        model: "dpdfnet_baseline.onnx",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("ceva-ip/DPDFNet"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speech-enhancement-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/models.html"),
    },
};

const DPDFNET2: SpeechRecipe = SpeechRecipe {
    id: "dpdfnet2",
    name: "DPDFNet2 (denoise)",
    description: "Fast, a DPDFNet denoiser for real-time use, 10.2 MB. Output is 16 kHz mono.",
    license: "Apache-2.0",
    license_url: DPDFNET_LICENSE_URL,
    delivery: Delivery::SingleFile {
        file_name: "dpdfnet2.onnx",
    },
    release_tag: SPEECH_ENHANCEMENT_TAG,
    size_bytes: 10_249_356,
    languages: &["any"],
    engine: Engine::Denoise(DenoiseEngine::DpdfNet {
        model: "dpdfnet2.onnx",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("ceva-ip/DPDFNet"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/speech-enhancement-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/models.html"),
    },
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
    links: ModelLinks {
        card_repo: None,
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/source-separation-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/source-separation/models.html"),
    },
};

/// Every curated audio model, in the order the Playground lists them.
pub(super) const RECIPES: &[SpeechRecipe] = &[
    GTCRN_SIMPLE,
    DPDFNET_BASELINE,
    DPDFNET2,
    DPDFNET2_48KHZ_HR,
    DPDFNET4,
    DPDFNET8,
    SPLEETER_2STEMS_INT8,
];

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
        assert_eq!(DPDFNET8.kind(), SpeechKind::Denoise);
        assert_eq!(DPDFNET2_48KHZ_HR.kind(), SpeechKind::Denoise);
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
        assert_eq!(DPDFNET8.engine.entries(), vec!["dpdfnet8.onnx"]);
        assert_eq!(
            DPDFNET_BASELINE.engine.entries(),
            vec!["dpdfnet_baseline.onnx"]
        );
        assert_eq!(DPDFNET2.engine.entries(), vec!["dpdfnet2.onnx"]);
        assert_eq!(
            DPDFNET2_48KHZ_HR.engine.entries(),
            vec!["dpdfnet2_48khz_hr.onnx"]
        );
    }

    #[test]
    fn the_dpdfnet_models_share_the_dpdfnet_engine_and_the_apache_licence() {
        for recipe in [
            &DPDFNET_BASELINE,
            &DPDFNET2,
            &DPDFNET4,
            &DPDFNET8,
            &DPDFNET2_48KHZ_HR,
        ] {
            assert!(
                matches!(
                    recipe.engine,
                    Engine::Denoise(DenoiseEngine::DpdfNet { .. })
                ),
                "{} should use the DPDFNet engine",
                recipe.id
            );
            assert_eq!(recipe.license, "Apache-2.0", "{}", recipe.id);
            assert_eq!(recipe.license_url, DPDFNET_LICENSE_URL, "{}", recipe.id);
            assert_eq!(recipe.release_tag, SPEECH_ENHANCEMENT_TAG, "{}", recipe.id);
        }
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
        for recipe in [
            &GTCRN_SIMPLE,
            &DPDFNET_BASELINE,
            &DPDFNET2,
            &DPDFNET4,
            &DPDFNET8,
            &DPDFNET2_48KHZ_HR,
        ] {
            let Delivery::SingleFile { file_name } = recipe.delivery else {
                panic!("{} should be a single file", recipe.id);
            };
            assert_eq!(recipe.asset_name(), file_name);
            assert_eq!(recipe.engine.entries(), vec![file_name]);
            assert!(file_name.ends_with(".onnx"), "{file_name}");
        }
    }

    #[test]
    fn the_48_khz_denoiser_is_listed_as_48_khz_and_the_others_as_16_khz() {
        assert!(DPDFNET2_48KHZ_HR.description.contains("48 kHz"));
        assert!(!DPDFNET2_48KHZ_HR.description.contains("16 kHz mono"));
        assert!(DPDFNET8.description.contains("16 kHz mono"));
        assert!(DPDFNET4.description.contains("16 kHz mono"));
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
        assert_eq!(DPDFNET8.size_bytes, 14_623_619);
        assert_eq!(DPDFNET2_48KHZ_HR.size_bytes, 10_596_848);
        assert_eq!(DPDFNET_BASELINE.size_bytes, 8_791_035);
        assert_eq!(DPDFNET2.size_bytes, 10_249_356);
        assert_eq!(SPLEETER_2STEMS_INT8.size_bytes, 48_623_481);
    }

    #[test]
    fn the_two_new_denoisers_are_fast_16_khz_dpdfnet_files_on_the_release() {
        for recipe in [&DPDFNET_BASELINE, &DPDFNET2] {
            assert!(recipe.description.starts_with("Fast"), "{}", recipe.id);
            assert!(recipe.description.contains("16 kHz mono"), "{}", recipe.id);
            assert_eq!(recipe.release_tag, SPEECH_ENHANCEMENT_TAG, "{}", recipe.id);
            assert_eq!(recipe.license, "Apache-2.0", "{}", recipe.id);
        }
        assert_eq!(
            speech_catalog::download_url(&DPDFNET2),
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/speech-enhancement-models/dpdfnet2.onnx"
        );
        assert_eq!(
            speech_catalog::download_url(&DPDFNET_BASELINE),
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/speech-enhancement-models/dpdfnet_baseline.onnx"
        );
    }

    #[test]
    fn the_denoisers_are_sorted_small_to_large_then_the_separator() {
        let sizes: Vec<u64> = RECIPES.iter().map(|recipe| recipe.size_bytes).collect();
        assert!(sizes.windows(2).all(|pair| pair[0] <= pair[1]), "{sizes:?}");
        assert_eq!(RECIPES[0].id, "gtcrn-simple");
        assert_eq!(RECIPES[RECIPES.len() - 1].id, "spleeter-2stems-int8");
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
