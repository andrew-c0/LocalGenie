//! The curated speech models: what each one is downloaded as, the files it reads, the sherpa-onnx
//! flags that load them, and the voices of a text to speech model. The audio models are in
//! `audio_catalog`, and they are listed and downloaded from here too.
//!
//! Each model is one release asset from `k2-fsa/sherpa-onnx`: a `.tar.bz2` archive unpacked into its
//! own folder, or a single `.onnx` file saved into it. The folder is
//! `<models root>/k2-fsa--sherpa-onnx/<model id>/`, so models never share files.

use std::path::{Path, PathBuf};

use serde::Serialize;

use super::audio_catalog::{self, DenoiseEngine, SeparateEngine};
use super::catalog::APACHE_LICENSE_URL;
use crate::commands::download::validate_file_name;

/// The folder under the models root that holds every speech model and its files.
const REPO_DIR: &str = "k2-fsa--sherpa-onnx";
/// Where the release assets are downloaded from. Only the tags in `ALLOWED_RELEASES` are allowed.
const RELEASE_PREFIX: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/";
const SPEECH_RECOGNITION_TAG: &str = "asr-models";
const SPEECH_SYNTHESIS_TAG: &str = "tts-models";
const MIT_LICENSE_URL_WHISPER: &str = "https://github.com/openai/whisper/blob/main/LICENSE";
const MIT_LICENSE_URL_MOONSHINE: &str =
    "https://github.com/moonshine-ai/moonshine/blob/main/LICENSE";

/// The release tags a model may be downloaded from, each with the file endings it may publish.
/// Anything else is refused.
const ALLOWED_RELEASES: &[(&str, &[&str])] = &[
    (SPEECH_RECOGNITION_TAG, &[ARCHIVE_ENDING]),
    (SPEECH_SYNTHESIS_TAG, &[ARCHIVE_ENDING]),
    (
        audio_catalog::SPEECH_ENHANCEMENT_TAG,
        &[ONNX_ENDING, ARCHIVE_ENDING],
    ),
    (
        audio_catalog::SOURCE_SEPARATION_TAG,
        &[ONNX_ENDING, ARCHIVE_ENDING],
    ),
];
const ARCHIVE_ENDING: &str = ".tar.bz2";
const ONNX_ENDING: &str = ".onnx";

/// Kokoro v1.0 speakers by speaker id, as the model's `id2speaker` metadata names them. Only the
/// English voices are offered: `af_` and `am_` (US), `bf_` and `bm_` (GB). Ids 28 to 53 are other
/// languages.
const KOKORO_SPEAKERS: &[(u32, &str)] = &[
    (0, "af_alloy"),
    (1, "af_aoede"),
    (2, "af_bella"),
    (3, "af_heart"),
    (4, "af_jessica"),
    (5, "af_kore"),
    (6, "af_nicole"),
    (7, "af_nova"),
    (8, "af_river"),
    (9, "af_sarah"),
    (10, "af_sky"),
    (11, "am_adam"),
    (12, "am_echo"),
    (13, "am_eric"),
    (14, "am_fenrir"),
    (15, "am_liam"),
    (16, "am_michael"),
    (17, "am_onyx"),
    (18, "am_puck"),
    (19, "am_santa"),
    (20, "bf_alice"),
    (21, "bf_emma"),
    (22, "bf_isabella"),
    (23, "bf_lily"),
    (24, "bm_daniel"),
    (25, "bm_fable"),
    (26, "bm_george"),
    (27, "bm_lewis"),
];

/// What a model does: speech to text, text to speech, speech denoising or source separation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SpeechKind {
    Stt,
    Tts,
    Denoise,
    Separate,
}

/// A speech to text model and the sherpa-onnx flags that load it.
#[derive(Debug, Clone, Copy)]
pub(super) enum SttEngine {
    /// Whisper: an encoder and a decoder, each a file in the model folder.
    Whisper {
        encoder: &'static str,
        decoder: &'static str,
        tokens: &'static str,
    },
    /// Moonshine: an encoder and one merged decoder.
    Moonshine {
        encoder: &'static str,
        merged_decoder: &'static str,
        tokens: &'static str,
    },
}

/// A text to speech model and the sherpa-onnx flags that load it.
#[derive(Debug, Clone, Copy)]
pub(super) enum TtsEngine {
    /// Kokoro: the model, the voice table, the tokens, a lexicon and a dictionary folder.
    Kokoro {
        model: &'static str,
        voices: &'static str,
        tokens: &'static str,
        lexicon: &'static str,
        dict_dir: &'static str,
    },
}

/// The engine of a model, which also says its kind.
#[derive(Debug, Clone, Copy)]
pub(super) enum Engine {
    Stt(SttEngine),
    Tts(TtsEngine),
    Denoise(DenoiseEngine),
    Separate(SeparateEngine),
}

impl Engine {
    pub(super) fn kind(&self) -> SpeechKind {
        match self {
            Engine::Stt(_) => SpeechKind::Stt,
            Engine::Tts(_) => SpeechKind::Tts,
            Engine::Denoise(_) => SpeechKind::Denoise,
            Engine::Separate(_) => SpeechKind::Separate,
        }
    }

    /// The files and folders the engine reads, relative to the model folder. A model is downloaded
    /// when all of them are on disk.
    pub(super) fn entries(&self) -> Vec<&'static str> {
        match *self {
            Engine::Stt(SttEngine::Whisper {
                encoder,
                decoder,
                tokens,
            }) => vec![encoder, decoder, tokens],
            Engine::Stt(SttEngine::Moonshine {
                encoder,
                merged_decoder,
                tokens,
            }) => vec![encoder, merged_decoder, tokens],
            Engine::Tts(TtsEngine::Kokoro {
                model,
                voices,
                tokens,
                lexicon,
                dict_dir,
            }) => vec![model, voices, tokens, lexicon, dict_dir],
            Engine::Denoise(engine) => vec![engine.model_file()],
            Engine::Separate(engine) => engine.model_files().to_vec(),
        }
    }
}

/// What a model is downloaded as. An archive is unpacked into the model's folder; a single file is
/// saved straight into it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Delivery {
    /// A `.tar.bz2` release asset, saved in the repo folder and unpacked into the model's folder.
    Archive { archive_name: &'static str },
    /// One release asset, saved under its own name in the model's folder.
    SingleFile { file_name: &'static str },
}

/// One curated speech model.
#[derive(Debug, Clone, Copy)]
pub(super) struct SpeechRecipe {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub license_url: &'static str,
    pub delivery: Delivery,
    /// The GitHub release tag the asset is published under.
    pub release_tag: &'static str,
    /// Size of the download on GitHub, in bytes. Checked after each download.
    pub size_bytes: u64,
    pub languages: &'static [&'static str],
    pub engine: Engine,
    /// The speakers a text to speech model offers, as (speaker id, speaker name). Empty for speech
    /// to text.
    pub speakers: &'static [(u32, &'static str)],
}

const WHISPER_TINY_EN: SpeechRecipe = SpeechRecipe {
    id: "whisper-tiny-en",
    name: "Whisper tiny (English)",
    description: "OpenAI's smallest Whisper model, English only. Quick on the CPU, but the least accurate of the Whisper sizes.",
    license: "MIT",
    license_url: MIT_LICENSE_URL_WHISPER,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-whisper-tiny.en.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 118_071_777,
    languages: &["en"],
    engine: Engine::Stt(SttEngine::Whisper {
        encoder: "tiny.en-encoder.int8.onnx",
        decoder: "tiny.en-decoder.int8.onnx",
        tokens: "tiny.en-tokens.txt",
    }),
    speakers: &[],
};

const MOONSHINE_BASE_EN: SpeechRecipe = SpeechRecipe {
    id: "moonshine-base-en",
    name: "Moonshine base (English)",
    description:
        "Moonshine's base model, English only. Compact, and quick on the CPU for short clips.",
    license: "MIT",
    license_url: MIT_LICENSE_URL_MOONSHINE,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-moonshine-base-en-quantized-2026-02-27.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 111_266_225,
    languages: &["en"],
    engine: Engine::Stt(SttEngine::Moonshine {
        encoder: "encoder_model.ort",
        merged_decoder: "decoder_model_merged.ort",
        tokens: "tokens.txt",
    }),
    speakers: &[],
};

const KOKORO_MULTI_V1: SpeechRecipe = SpeechRecipe {
    id: "kokoro-int8-multi-v1",
    name: "Kokoro v1.0 (int8)",
    description: "A small text to speech model with 28 English voices, American and British. Speed from 0.5x to 2x.",
    license: "Apache-2.0",
    license_url: APACHE_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "kokoro-int8-multi-lang-v1_0.tar.bz2",
    },
    release_tag: SPEECH_SYNTHESIS_TAG,
    size_bytes: 132_353_410,
    languages: &["en-US", "en-GB"],
    engine: Engine::Tts(TtsEngine::Kokoro {
        model: "model.int8.onnx",
        voices: "voices.bin",
        tokens: "tokens.txt",
        lexicon: "lexicon-us-en.txt",
        dict_dir: "dict",
    }),
    speakers: KOKORO_SPEAKERS,
};

/// The speech to text and text to speech models, in the order the Playground lists them.
pub(super) const RECIPES: &[SpeechRecipe] = &[WHISPER_TINY_EN, MOONSHINE_BASE_EN, KOKORO_MULTI_V1];

/// Every curated model the speech job slot runs: the speech models, then the audio models.
pub(super) fn all_recipes() -> impl Iterator<Item = &'static SpeechRecipe> {
    RECIPES.iter().chain(audio_catalog::RECIPES.iter())
}

/// The recipe with this id, or an error for an id that is not in the catalogue.
pub(super) fn find_recipe(id: &str) -> Result<&'static SpeechRecipe, String> {
    all_recipes()
        .find(|recipe| recipe.id == id)
        .ok_or_else(|| format!("Unknown speech model: {id}"))
}

/// Fails with a request to download the model first, when it is not on disk.
pub(super) fn require_downloaded(recipe: &SpeechRecipe, models_root: &Path) -> Result<(), String> {
    if is_downloaded(recipe, models_root) {
        Ok(())
    } else {
        Err(format!(
            "{} is not downloaded yet. Download it first.",
            recipe.name
        ))
    }
}

/// A voice of a text to speech model. `label` reads as "Heart (US female)".
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechVoice {
    pub id: u32,
    pub name: String,
    pub label: String,
}

/// A speech model as the Playground lists it, with its download state.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechModel {
    pub id: &'static str,
    pub kind: SpeechKind,
    pub name: &'static str,
    pub description: &'static str,
    pub license: &'static str,
    pub license_url: &'static str,
    pub size_bytes: u64,
    pub languages: Vec<&'static str>,
    pub downloaded: bool,
    pub voices: Vec<SpeechVoice>,
}

impl SpeechRecipe {
    pub(super) fn kind(&self) -> SpeechKind {
        self.engine.kind()
    }

    /// The release asset's file name, which is also the name it is saved under.
    pub(super) fn asset_name(&self) -> &'static str {
        match self.delivery {
            Delivery::Archive { archive_name } => archive_name,
            Delivery::SingleFile { file_name } => file_name,
        }
    }

    /// The voices a text to speech model offers. Empty for speech to text.
    pub(super) fn voices(&self) -> Vec<SpeechVoice> {
        self.speakers
            .iter()
            .filter_map(|(id, code)| speaker_voice(*id, code))
            .collect()
    }

    /// The voice with this id, when the model offers one.
    pub(super) fn voice(&self, voice_id: u32) -> Option<SpeechVoice> {
        self.voices().into_iter().find(|voice| voice.id == voice_id)
    }
}

/// The voice for a Kokoro speaker code such as `af_heart`: the region and gender come from its
/// prefix, the name from the rest. None for a code with another prefix.
fn speaker_voice(id: u32, code: &str) -> Option<SpeechVoice> {
    let (prefix, speaker) = code.split_once('_')?;
    let (region, gender) = match prefix {
        "af" => ("US", "female"),
        "am" => ("US", "male"),
        "bf" => ("GB", "female"),
        "bm" => ("GB", "male"),
        _ => return None,
    };
    let name = capitalise(speaker);
    Some(SpeechVoice {
        id,
        label: format!("{name} ({region} {gender})"),
        name,
    })
}

/// The first letter in upper case, the rest as they are.
fn capitalise(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// The listing entry for `recipe`, checking its files under `models_root`.
pub(super) fn describe(recipe: &SpeechRecipe, models_root: &Path) -> SpeechModel {
    SpeechModel {
        id: recipe.id,
        kind: recipe.kind(),
        name: recipe.name,
        description: recipe.description,
        license: recipe.license,
        license_url: recipe.license_url,
        size_bytes: recipe.size_bytes,
        languages: recipe.languages.to_vec(),
        downloaded: is_downloaded(recipe, models_root),
        voices: recipe.voices(),
    }
}

/// True when every file the engine reads is on disk.
pub(super) fn is_downloaded(recipe: &SpeechRecipe, models_root: &Path) -> bool {
    let folder = model_dir(models_root, recipe);
    recipe
        .engine
        .entries()
        .iter()
        .all(|entry| folder.join(entry).exists())
}

/// The folder the archives and the unpacked models are kept in: `<models root>/k2-fsa--sherpa-onnx`.
pub(super) fn repo_dir(models_root: &Path) -> PathBuf {
    models_root.join(REPO_DIR)
}

/// The folder one model unpacks to: `<repo folder>/<model id>`.
pub(super) fn model_dir(models_root: &Path, recipe: &SpeechRecipe) -> PathBuf {
    repo_dir(models_root).join(recipe.id)
}

/// Where the download is saved while it is fetched: the archive in the repo folder, or the single
/// file in the model's folder.
pub(super) fn download_target(models_root: &Path, recipe: &SpeechRecipe) -> PathBuf {
    match recipe.delivery {
        Delivery::Archive { archive_name } => repo_dir(models_root).join(archive_name),
        Delivery::SingleFile { file_name } => model_dir(models_root, recipe).join(file_name),
    }
}

/// The GitHub release asset the download is fetched from.
pub(super) fn download_url(recipe: &SpeechRecipe) -> String {
    format!(
        "{RELEASE_PREFIX}{}/{}",
        recipe.release_tag,
        recipe.asset_name()
    )
}

/// True for a release asset of `k2-fsa/sherpa-onnx` under one of the `ALLOWED_RELEASES` tags, with
/// a file name that ends in one of that tag's endings and nothing else in the path. Every other URL
/// is refused.
pub(super) fn is_allowed_speech_url(url: &str) -> bool {
    let Some(path) = url.strip_prefix(RELEASE_PREFIX) else {
        return false;
    };
    let Some((tag, file)) = path.split_once('/') else {
        return false;
    };
    let Some((_, endings)) = ALLOWED_RELEASES.iter().find(|(allowed, _)| *allowed == tag) else {
        return false;
    };
    endings.iter().any(|ending| file.ends_with(ending)) && validate_file_name(file).is_ok()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::super::test_support::Scratch;
    use super::*;

    #[test]
    fn ids_are_unique_and_findable() {
        let recipes: Vec<&SpeechRecipe> = all_recipes().collect();
        let ids: HashSet<&str> = recipes.iter().map(|recipe| recipe.id).collect();
        assert_eq!(ids.len(), recipes.len());
        for recipe in recipes {
            assert_eq!(find_recipe(recipe.id).map(|r| r.id), Ok(recipe.id));
        }
        assert!(find_recipe("../etc").is_err());
    }

    #[test]
    fn every_download_url_is_on_the_allowlist() {
        for recipe in all_recipes() {
            let url = download_url(recipe);
            assert!(is_allowed_speech_url(&url), "{url} is not allowed");
            assert!(url.ends_with(recipe.asset_name()), "{url}");
        }
        assert_eq!(
            download_url(&WHISPER_TINY_EN),
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2"
        );
        assert_eq!(
            download_url(&KOKORO_MULTI_V1),
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2"
        );
    }

    #[test]
    fn only_sherpa_speech_release_assets_are_allowed() {
        let allowed = [
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/a.tar.bz2",
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/b_c.tar.bz2",
        ];
        for url in allowed {
            assert!(is_allowed_speech_url(url), "{url}");
        }
        let refused = [
            "http://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/a.tar.bz2",
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/other-tag/a.tar.bz2",
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/a.zip",
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/a.onnx",
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/../x.tar.bz2",
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sub/a.tar.bz2",
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/",
            "https://github.com/someone/sherpa-onnx/releases/download/asr-models/a.tar.bz2",
            "https://github.com/k2-fsa/sherpa-onnx/archive/refs/heads/main.tar.bz2",
            "https://evil.example/k2-fsa/sherpa-onnx/releases/download/asr-models/a.tar.bz2",
        ];
        for url in refused {
            assert!(!is_allowed_speech_url(url), "{url} should be refused");
        }
    }

    #[test]
    fn the_audio_tags_allow_onnx_and_archives_and_nothing_else() {
        let base = "https://github.com/k2-fsa/sherpa-onnx/releases/download/";
        for tag in ["speech-enhancement-models", "source-separation-models"] {
            for file in ["gtcrn_simple.onnx", "sherpa-onnx-spleeter.tar.bz2"] {
                let url = format!("{base}{tag}/{file}");
                assert!(is_allowed_speech_url(&url), "{url}");
            }
            for file in ["model.bin", "model.zip", "model.onnx.exe", "../model.onnx"] {
                let url = format!("{base}{tag}/{file}");
                assert!(!is_allowed_speech_url(&url), "{url} should be refused");
            }
        }
        // The speech tags keep their archive-only rule.
        assert!(!is_allowed_speech_url(&format!(
            "{base}asr-models/model.onnx"
        )));
    }

    #[test]
    fn kokoro_offers_the_twenty_eight_english_voices_with_labels() {
        let voices = KOKORO_MULTI_V1.voices();
        assert_eq!(voices.len(), 28);
        assert!(voices.iter().all(|voice| voice.id <= 27));
        let heart = KOKORO_MULTI_V1.voice(3).expect("heart");
        assert_eq!(heart.name, "Heart");
        assert_eq!(heart.label, "Heart (US female)");
        assert_eq!(
            KOKORO_MULTI_V1.voice(20).expect("alice").label,
            "Alice (GB female)"
        );
        assert_eq!(
            KOKORO_MULTI_V1.voice(16).expect("michael").label,
            "Michael (US male)"
        );
        assert_eq!(
            KOKORO_MULTI_V1.voice(24).expect("daniel").label,
            "Daniel (GB male)"
        );
        assert!(
            KOKORO_MULTI_V1.voice(53).is_none(),
            "Spanish is not offered"
        );
        assert!(WHISPER_TINY_EN.voices().is_empty());
    }

    #[test]
    fn speaker_codes_with_other_prefixes_are_not_voices() {
        assert_eq!(speaker_voice(28, "ef_dora"), None);
        assert_eq!(speaker_voice(0, "nounderscore"), None);
    }

    #[test]
    fn engines_name_the_files_they_read_and_the_kinds_match() {
        assert_eq!(
            WHISPER_TINY_EN.engine.entries(),
            vec![
                "tiny.en-encoder.int8.onnx",
                "tiny.en-decoder.int8.onnx",
                "tiny.en-tokens.txt"
            ]
        );
        assert_eq!(
            MOONSHINE_BASE_EN.engine.entries(),
            vec![
                "encoder_model.ort",
                "decoder_model_merged.ort",
                "tokens.txt"
            ]
        );
        assert_eq!(WHISPER_TINY_EN.kind(), SpeechKind::Stt);
        assert_eq!(MOONSHINE_BASE_EN.kind(), SpeechKind::Stt);
        assert_eq!(KOKORO_MULTI_V1.kind(), SpeechKind::Tts);
    }

    #[test]
    fn a_model_is_downloaded_when_all_its_entries_are_on_disk() {
        let scratch = Scratch::new("speech-downloaded");
        let root = scratch.path();
        let folder = model_dir(root, &WHISPER_TINY_EN);
        std::fs::create_dir_all(&folder).expect("folder");
        for entry in WHISPER_TINY_EN.engine.entries() {
            assert!(!is_downloaded(&WHISPER_TINY_EN, root));
            std::fs::write(folder.join(entry), b"x").expect("file");
        }
        assert!(is_downloaded(&WHISPER_TINY_EN, root));
        let listed = describe(&WHISPER_TINY_EN, root);
        assert!(listed.downloaded);
        assert_eq!(listed.kind, SpeechKind::Stt);
        assert!(listed.voices.is_empty());
    }

    #[test]
    fn each_model_has_its_own_folder_under_the_repo_folder() {
        let root = Path::new("models");
        assert_eq!(
            model_dir(root, &WHISPER_TINY_EN),
            root.join(REPO_DIR).join("whisper-tiny-en")
        );
        assert_eq!(
            download_target(root, &KOKORO_MULTI_V1),
            root.join(REPO_DIR)
                .join("kokoro-int8-multi-lang-v1_0.tar.bz2")
        );
        assert_ne!(
            model_dir(root, &MOONSHINE_BASE_EN),
            model_dir(root, &WHISPER_TINY_EN)
        );
    }

    #[test]
    fn a_single_file_model_downloads_straight_into_its_folder() {
        let root = Path::new("models");
        let gtcrn = find_recipe("gtcrn-simple").expect("gtcrn");
        assert_eq!(
            download_target(root, gtcrn),
            root.join(REPO_DIR)
                .join("gtcrn-simple")
                .join("gtcrn_simple.onnx")
        );
        assert_eq!(
            download_url(gtcrn),
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/speech-enhancement-models/gtcrn_simple.onnx"
        );
    }

    #[test]
    fn the_listing_has_the_audio_kinds_after_the_speech_models() {
        let scratch = Scratch::new("speech-kinds");
        let kinds: Vec<SpeechKind> = all_recipes()
            .map(|recipe| describe(recipe, scratch.path()).kind)
            .collect();
        assert_eq!(
            kinds,
            vec![
                SpeechKind::Stt,
                SpeechKind::Stt,
                SpeechKind::Tts,
                SpeechKind::Denoise,
                SpeechKind::Denoise,
                SpeechKind::Separate,
            ]
        );
    }

    #[test]
    fn listing_serialises_with_the_camel_case_contract() {
        let scratch = Scratch::new("speech-json");
        let json = serde_json::to_value(describe(&KOKORO_MULTI_V1, scratch.path())).expect("json");
        assert_eq!(json["kind"], "tts");
        assert_eq!(json["sizeBytes"], 132_353_410u64);
        assert_eq!(json["licenseUrl"], APACHE_LICENSE_URL);
        assert_eq!(json["downloaded"], false);
        assert_eq!(json["voices"][3]["id"], 3);
        assert_eq!(json["voices"][3]["label"], "Heart (US female)");
        assert_eq!(json["languages"][0], "en-US");
        let stt = serde_json::to_value(describe(&WHISPER_TINY_EN, scratch.path())).expect("json");
        assert_eq!(stt["kind"], "stt");
        assert_eq!(stt["voices"], serde_json::json!([]));
    }
}
