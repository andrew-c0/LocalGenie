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
use super::model_links::ModelLinks;
use crate::commands::download::validate_file_name;

/// The folder under the models root that holds every speech model and its files.
const REPO_DIR: &str = "k2-fsa--sherpa-onnx";
/// Where the release assets are downloaded from. Only the tags in `ALLOWED_RELEASES` are allowed.
const RELEASE_PREFIX: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/";
const SPEECH_RECOGNITION_TAG: &str = "asr-models";
const SPEECH_SYNTHESIS_TAG: &str = "tts-models";
const MIT_LICENSE_URL_WHISPER: &str = "https://github.com/openai/whisper/blob/main/LICENSE";
const POCKET_TTS_LICENSE_URL: &str = "https://github.com/kyutai-labs/pocket-tts";
const MIT_LICENSE_URL_MOONSHINE: &str =
    "https://github.com/moonshine-ai/moonshine/blob/main/LICENSE";
const FUNASR_LICENSE_URL: &str = "https://github.com/modelscope/FunASR/blob/main/MODEL_LICENSE";
const CC_BY_LICENSE_URL: &str = "https://creativecommons.org/licenses/by/4.0/legalcode.en";
const OPENRAIL_M_LICENSE_URL: &str =
    "https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE";
const KITTEN_LICENSE_URL: &str = "https://huggingface.co/KittenML/kitten-tts-nano-0.2";
const BLIZZARD_LESSAC_LICENSE_URL: &str =
    "https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html";
const GLADOS_LICENSE_URL: &str = "https://github.com/dnhkng/GlaDOS";
const MATCHA_DOCS_URL: &str =
    "https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/matcha.html";
/// Release tag of the vocoder files a Matcha model needs next to its acoustic model.
const VOCODER_TAG: &str = "vocoder-models";

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
    (VOCODER_TAG, &[ONNX_ENDING]),
];
const ARCHIVE_ENDING: &str = ".tar.bz2";
const ONNX_ENDING: &str = ".onnx";

/// Supertonic speakers by speaker id. The model's docs give no names, so each is "Voice N". The
/// sherpa-onnx example says the model has ten speakers, ids 0 to 9.
const SUPERTONIC_SPEAKERS: &[(u32, &str)] = &[
    (0, "Voice 0"),
    (1, "Voice 1"),
    (2, "Voice 2"),
    (3, "Voice 3"),
    (4, "Voice 4"),
    (5, "Voice 5"),
    (6, "Voice 6"),
    (7, "Voice 7"),
    (8, "Voice 8"),
    (9, "Voice 9"),
];

/// The first 40 of the 904 LibriTTS-R speakers of the Piper model, by speaker id. The docs give no
/// names for them, so each is "Voice N".
const LIBRITTS_SPEAKERS: &[(u32, &str)] = &[
    (0, "Voice 0"),
    (1, "Voice 1"),
    (2, "Voice 2"),
    (3, "Voice 3"),
    (4, "Voice 4"),
    (5, "Voice 5"),
    (6, "Voice 6"),
    (7, "Voice 7"),
    (8, "Voice 8"),
    (9, "Voice 9"),
    (10, "Voice 10"),
    (11, "Voice 11"),
    (12, "Voice 12"),
    (13, "Voice 13"),
    (14, "Voice 14"),
    (15, "Voice 15"),
    (16, "Voice 16"),
    (17, "Voice 17"),
    (18, "Voice 18"),
    (19, "Voice 19"),
    (20, "Voice 20"),
    (21, "Voice 21"),
    (22, "Voice 22"),
    (23, "Voice 23"),
    (24, "Voice 24"),
    (25, "Voice 25"),
    (26, "Voice 26"),
    (27, "Voice 27"),
    (28, "Voice 28"),
    (29, "Voice 29"),
    (30, "Voice 30"),
    (31, "Voice 31"),
    (32, "Voice 32"),
    (33, "Voice 33"),
    (34, "Voice 34"),
    (35, "Voice 35"),
    (36, "Voice 36"),
    (37, "Voice 37"),
    (38, "Voice 38"),
    (39, "Voice 39"),
];

/// Kitten nano v0.2 speakers by speaker id, as the sherpa-onnx docs name them. `m` is male and `f`
/// female; the name is read by `kitten_voice`.
const KITTEN_NANO_V02_SPEAKERS: &[(u32, &str)] = &[
    (0, "expr-voice-2-m"),
    (1, "expr-voice-2-f"),
    (2, "expr-voice-3-m"),
    (3, "expr-voice-3-f"),
    (4, "expr-voice-4-m"),
    (5, "expr-voice-4-f"),
    (6, "expr-voice-5-m"),
    (7, "expr-voice-5-f"),
];

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
    /// SenseVoice: one model file and the tokens. The arguments set the language and inverse text
    /// normalisation.
    SenseVoice {
        model: &'static str,
        tokens: &'static str,
    },
    /// A NeMo transducer such as Parakeet: an encoder, a decoder, a joiner and the tokens.
    NemoTransducer {
        encoder: &'static str,
        decoder: &'static str,
        joiner: &'static str,
        tokens: &'static str,
    },
}

/// A second release asset a model needs, saved into the model's folder under its own name. Only a
/// Matcha model has one: its vocoder.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Companion {
    pub release_tag: &'static str,
    pub file_name: &'static str,
    pub size_bytes: u64,
}

/// The vocoder a Matcha model is run with, from the `vocoder-models` release.
const VOCOS_22KHZ: Companion = Companion {
    release_tag: VOCODER_TAG,
    file_name: "vocos-22khz-univ.onnx",
    size_bytes: 53_884_024,
};

/// A text to speech model and the sherpa-onnx flags that load it.
#[derive(Debug, Clone, Copy)]
pub(super) enum TtsEngine {
    /// Piper, run as VITS: the model, the tokens and the espeak-ng data folder. The speakers are
    /// chosen by id, and the speed is the inverse of the length scale.
    Vits {
        model: &'static str,
        tokens: &'static str,
        data_dir: &'static str,
    },
    /// Matcha: an acoustic model, a vocoder that is a separate download, the tokens and the
    /// espeak-ng data folder.
    Matcha {
        acoustic_model: &'static str,
        vocoder: Companion,
        tokens: &'static str,
        data_dir: &'static str,
    },
    /// Kitten: the model, the voice table, the tokens and the espeak-ng data folder. The speakers
    /// are chosen by id.
    Kitten {
        model: &'static str,
        voices: &'static str,
        tokens: &'static str,
        data_dir: &'static str,
    },
    /// Kokoro: the model, the voice table, the tokens, a lexicon and a dictionary folder.
    Kokoro {
        model: &'static str,
        voices: &'static str,
        tokens: &'static str,
        lexicon: &'static str,
        dict_dir: &'static str,
    },
    /// Supertonic: seven model files and the voice styles, with a language code the arguments pass.
    /// The speakers are chosen by id.
    Supertonic {
        duration_predictor: &'static str,
        text_encoder: &'static str,
        vector_estimator: &'static str,
        vocoder: &'static str,
        tts_json: &'static str,
        unicode_indexer: &'static str,
        voice_style: &'static str,
        language: &'static str,
    },
    /// Pocket TTS: voice cloning from a reference recording, with no built-in voices.
    PocketTts {
        lm_flow: &'static str,
        lm_main: &'static str,
        encoder: &'static str,
        decoder: &'static str,
        text_conditioner: &'static str,
        vocab_json: &'static str,
        token_scores_json: &'static str,
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
            Engine::Stt(SttEngine::SenseVoice { model, tokens }) => vec![model, tokens],
            Engine::Stt(SttEngine::NemoTransducer {
                encoder,
                decoder,
                joiner,
                tokens,
            }) => vec![encoder, decoder, joiner, tokens],
            Engine::Tts(TtsEngine::Kokoro {
                model,
                voices,
                tokens,
                lexicon,
                dict_dir,
            }) => vec![model, voices, tokens, lexicon, dict_dir],
            Engine::Tts(TtsEngine::Supertonic {
                duration_predictor,
                text_encoder,
                vector_estimator,
                vocoder,
                tts_json,
                unicode_indexer,
                voice_style,
                ..
            }) => vec![
                duration_predictor,
                text_encoder,
                vector_estimator,
                vocoder,
                tts_json,
                unicode_indexer,
                voice_style,
            ],
            Engine::Tts(TtsEngine::PocketTts {
                lm_flow,
                lm_main,
                encoder,
                decoder,
                text_conditioner,
                vocab_json,
                token_scores_json,
            }) => vec![
                lm_flow,
                lm_main,
                encoder,
                decoder,
                text_conditioner,
                vocab_json,
                token_scores_json,
            ],
            Engine::Tts(TtsEngine::Vits {
                model,
                tokens,
                data_dir,
            }) => vec![model, tokens, data_dir],
            Engine::Tts(TtsEngine::Matcha {
                acoustic_model,
                vocoder,
                tokens,
                data_dir,
            }) => vec![acoustic_model, vocoder.file_name, tokens, data_dir],
            Engine::Tts(TtsEngine::Kitten {
                model,
                voices,
                tokens,
                data_dir,
            }) => vec![model, voices, tokens, data_dir],
            Engine::Denoise(engine) => vec![engine.model_file()],
            Engine::Separate(engine) => engine.model_files().to_vec(),
        }
    }

    /// The voice a speaker entry of this model stands for, or None when the model has no speakers.
    /// A Kokoro entry is a speaker code such as `af_heart`, and a Kitten entry a code such as
    /// `expr-voice-2-f`. A Supertonic, Piper (VITS) or Matcha entry is the voice's name.
    fn speaker_voice(self, id: u32, code: &str) -> Option<SpeechVoice> {
        match self {
            Engine::Tts(TtsEngine::Kokoro { .. }) => kokoro_voice(id, code),
            Engine::Tts(TtsEngine::Kitten { .. }) => kitten_voice(id, code),
            Engine::Tts(TtsEngine::Supertonic { .. })
            | Engine::Tts(TtsEngine::Vits { .. })
            | Engine::Tts(TtsEngine::Matcha { .. }) => Some(SpeechVoice {
                id,
                name: code.to_string(),
                label: code.to_string(),
            }),
            _ => None,
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
    pub links: ModelLinks,
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
    links: ModelLinks {
        card_repo: Some("openai/whisper-tiny.en"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/pretrained_models/whisper/index.html"),
    },
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
    links: ModelLinks {
        card_repo: Some("UsefulSensors/moonshine-base"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/moonshine/index.html"),
    },
};

const MOONSHINE_TINY_EN: SpeechRecipe = SpeechRecipe {
    id: "moonshine-tiny-en",
    name: "Moonshine tiny (English)",
    description: "Fast, Moonshine's tiny English model for quick transcripts of short clips on the CPU. English only, about 30 MB download.",
    license: "MIT",
    license_url: MIT_LICENSE_URL_MOONSHINE,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-moonshine-tiny-en-quantized-2026-02-27.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 29_858_559,
    languages: &["en"],
    engine: Engine::Stt(SttEngine::Moonshine {
        encoder: "encoder_model.ort",
        merged_decoder: "decoder_model_merged.ort",
        tokens: "tokens.txt",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("UsefulSensors/moonshine-tiny"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/moonshine/index.html"),
    },
};

const WHISPER_BASE_EN: SpeechRecipe = SpeechRecipe {
    id: "whisper-base-en",
    name: "Whisper base (English)",
    description: "Balanced, OpenAI's base Whisper model for English dictation and clear recordings. English only, about 209 MB download.",
    license: "MIT",
    license_url: MIT_LICENSE_URL_WHISPER,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-whisper-base.en.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 208_576_005,
    languages: &["en"],
    engine: Engine::Stt(SttEngine::Whisper {
        encoder: "base.en-encoder.int8.onnx",
        decoder: "base.en-decoder.int8.onnx",
        tokens: "base.en-tokens.txt",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("openai/whisper-base.en"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/pretrained_models/whisper/index.html"),
    },
};

const WHISPER_BASE_MULTI: SpeechRecipe = SpeechRecipe {
    id: "whisper-base",
    name: "Whisper base (multilingual)",
    description: "Balanced, OpenAI's multilingual base Whisper model. It detects the language and transcribes about 99 of them. About 208 MB download.",
    license: "MIT",
    license_url: MIT_LICENSE_URL_WHISPER,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-whisper-base.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 207_557_382,
    languages: &["multi"],
    engine: Engine::Stt(SttEngine::Whisper {
        encoder: "base-encoder.int8.onnx",
        decoder: "base-decoder.int8.onnx",
        tokens: "base-tokens.txt",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("openai/whisper-base"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/pretrained_models/whisper/index.html"),
    },
};

const WHISPER_SMALL_EN: SpeechRecipe = SpeechRecipe {
    id: "whisper-small-en",
    name: "Whisper small (English)",
    description: "Balanced, OpenAI's small Whisper model for English. More accurate than base, but slower on the CPU. English only, about 636 MB download.",
    license: "MIT",
    license_url: MIT_LICENSE_URL_WHISPER,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-whisper-small.en.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 635_693_775,
    languages: &["en"],
    engine: Engine::Stt(SttEngine::Whisper {
        encoder: "small.en-encoder.int8.onnx",
        decoder: "small.en-decoder.int8.onnx",
        tokens: "small.en-tokens.txt",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("openai/whisper-small.en"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/pretrained_models/whisper/index.html"),
    },
};

const WHISPER_TURBO: SpeechRecipe = SpeechRecipe {
    id: "whisper-turbo",
    name: "Whisper large-v3 turbo (multilingual)",
    description: "Best quality, OpenAI's large-v3 turbo Whisper model, the most accurate Whisper model here. It detects the language and transcribes about 99 of them. About 564 MB download.",
    license: "MIT",
    license_url: MIT_LICENSE_URL_WHISPER,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-whisper-turbo.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 563_790_207,
    languages: &["multi"],
    engine: Engine::Stt(SttEngine::Whisper {
        encoder: "turbo-encoder.int8.onnx",
        decoder: "turbo-decoder.int8.onnx",
        tokens: "turbo-tokens.txt",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("openai/whisper-large-v3-turbo"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/pretrained_models/whisper/index.html"),
    },
};

const SENSE_VOICE_INT8: SpeechRecipe = SpeechRecipe {
    id: "sense-voice-int8",
    name: "SenseVoice (int8)",
    description: "Alibaba's speech to text model for Chinese, English, Japanese, Korean and Cantonese. It detects the language, and adds punctuation and inverse text normalisation.",
    license: "FunASR Model Open Source License 1.1",
    license_url: FUNASR_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 165_783_878,
    languages: &["zh", "en", "ja", "ko", "yue"],
    engine: Engine::Stt(SttEngine::SenseVoice {
        model: "model.int8.onnx",
        tokens: "tokens.txt",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("FunAudioLLM/SenseVoiceSmall"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/sense-voice/index.html"),
    },
};

const PARAKEET_TDT_V3_INT8: SpeechRecipe = SpeechRecipe {
    id: "parakeet-tdt-v3-int8",
    name: "Parakeet TDT 0.6B v3 (int8)",
    description: "NVIDIA's speech to text model for 25 European languages, including English. It has no language setting. A large download.",
    license: "CC-BY-4.0",
    license_url: CC_BY_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2",
    },
    release_tag: SPEECH_RECOGNITION_TAG,
    size_bytes: 487_170_055,
    languages: &[
        "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt",
        "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk",
    ],
    engine: Engine::Stt(SttEngine::NemoTransducer {
        encoder: "encoder.int8.onnx",
        decoder: "decoder.int8.onnx",
        joiner: "joiner.int8.onnx",
        tokens: "tokens.txt",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("nvidia/parakeet-tdt-0.6b-v3"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/nemo/index.html"),
    },
};

const SUPERTONIC_3_INT8: SpeechRecipe = SpeechRecipe {
    id: "supertonic-3-int8",
    name: "Supertonic 3 (int8, English)",
    description: "Supertone's text to speech model. It speaks 31 languages; the app offers English for now. Ten voices, speed from 0.5x to 2x.",
    license: "BigScience OpenRAIL-M",
    license_url: OPENRAIL_M_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2",
    },
    release_tag: SPEECH_SYNTHESIS_TAG,
    size_bytes: 128_774_318,
    languages: &["en"],
    engine: Engine::Tts(TtsEngine::Supertonic {
        duration_predictor: "duration_predictor.int8.onnx",
        text_encoder: "text_encoder.int8.onnx",
        vector_estimator: "vector_estimator.int8.onnx",
        vocoder: "vocoder.int8.onnx",
        tts_json: "tts.json",
        unicode_indexer: "unicode_indexer.bin",
        voice_style: "voice.bin",
        language: "en",
    }),
    speakers: SUPERTONIC_SPEAKERS,
    links: ModelLinks {
        card_repo: Some("Supertone/supertonic-3"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/tts/supertonic.html"),
    },
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
    links: ModelLinks {
        card_repo: Some("hexgrad/Kokoro-82M"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kokoro.html"),
    },
};

const POCKET_TTS_INT8: SpeechRecipe = SpeechRecipe {
    id: "pocket-tts-int8",
    name: "Pocket TTS (voice cloning)",
    description: "Clones a voice from a short reference recording and reads the text in it. English only, no built-in voices, and the speed cannot be changed.",
    license: "Non-commercial (Kyutai Pocket TTS, ONNX export)",
    license_url: POCKET_TTS_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "sherpa-onnx-pocket-tts-int8-2026-01-26.tar.bz2",
    },
    release_tag: SPEECH_SYNTHESIS_TAG,
    size_bytes: 98_336_520,
    languages: &["en"],
    engine: Engine::Tts(TtsEngine::PocketTts {
        lm_flow: "lm_flow.int8.onnx",
        lm_main: "lm_main.int8.onnx",
        encoder: "encoder.onnx",
        decoder: "decoder.int8.onnx",
        text_conditioner: "text_conditioner.onnx",
        vocab_json: "vocab.json",
        token_scores_json: "token_scores.json",
    }),
    speakers: &[],
    links: ModelLinks {
        card_repo: Some("kyutai/pocket-tts"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/tts/pocket.html"),
    },
};

const KITTEN_NANO_V02_FP16: SpeechRecipe = SpeechRecipe {
    id: "kitten-nano-en-v0-2-fp16",
    name: "Kitten nano 0.2 (fp16, English)",
    description: "Fast, a tiny English text to speech model with eight voices, four male and four female. English only, about 27 MB download.",
    license: "Apache-2.0",
    license_url: KITTEN_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "kitten-nano-en-v0_2-fp16.tar.bz2",
    },
    release_tag: SPEECH_SYNTHESIS_TAG,
    size_bytes: 26_586_708,
    languages: &["en"],
    engine: Engine::Tts(TtsEngine::Kitten {
        model: "model.fp16.onnx",
        voices: "voices.bin",
        tokens: "tokens.txt",
        data_dir: "espeak-ng-data",
    }),
    speakers: KITTEN_NANO_V02_SPEAKERS,
    links: ModelLinks {
        card_repo: Some("KittenML/kitten-tts-nano-0.2"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/kitten.html"),
    },
};

const PIPER_LESSAC_MEDIUM: SpeechRecipe = SpeechRecipe {
    id: "piper-lessac-medium",
    name: "Piper Lessac medium (US English)",
    description: "Fast, a single US English voice from Piper, for quick read-aloud. English only, about 67 MB download.",
    license: "Unclear: Blizzard 2013 Lessac research licence",
    license_url: BLIZZARD_LESSAC_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "vits-piper-en_US-lessac-medium.tar.bz2",
    },
    release_tag: SPEECH_SYNTHESIS_TAG,
    size_bytes: 67_230_653,
    languages: &["en-US"],
    engine: Engine::Tts(TtsEngine::Vits {
        model: "en_US-lessac-medium.onnx",
        tokens: "tokens.txt",
        data_dir: "espeak-ng-data",
    }),
    speakers: &[(0, "Lessac")],
    links: ModelLinks {
        card_repo: Some("rhasspy/piper-voices"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/tts/piper.html"),
    },
};

const PIPER_GLADOS: SpeechRecipe = SpeechRecipe {
    id: "piper-glados",
    name: "Piper GLaDOS (English)",
    description: "Fast, Piper's GLaDOS voice, a single English voice in the style of the Portal character. English only, about 67 MB download.",
    license: "Unclear: the GLaDOS project has no licence file and says the voice belongs to Valve",
    license_url: GLADOS_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "vits-piper-en_US-glados.tar.bz2",
    },
    release_tag: SPEECH_SYNTHESIS_TAG,
    size_bytes: 67_208_137,
    languages: &["en-US"],
    engine: Engine::Tts(TtsEngine::Vits {
        model: "en_US-glados.onnx",
        tokens: "tokens.txt",
        data_dir: "espeak-ng-data",
    }),
    speakers: &[(0, "GLaDOS")],
    links: ModelLinks {
        card_repo: None,
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/tts/piper.html"),
    },
};

const MATCHA_LJSPEECH: SpeechRecipe = SpeechRecipe {
    id: "matcha-ljspeech",
    name: "Matcha LJSpeech (US English)",
    description: "Balanced, a single female US English voice from Matcha. It also needs a 54 MB vocoder, so the whole download is about 131 MB. English only.",
    license: "Unclear: the sherpa-onnx docs do not state the licence of these weights",
    license_url: MATCHA_DOCS_URL,
    delivery: Delivery::Archive {
        archive_name: "matcha-icefall-en_US-ljspeech.tar.bz2",
    },
    release_tag: SPEECH_SYNTHESIS_TAG,
    size_bytes: 76_757_969,
    languages: &["en-US"],
    engine: Engine::Tts(TtsEngine::Matcha {
        acoustic_model: "model-steps-3.onnx",
        vocoder: VOCOS_22KHZ,
        tokens: "tokens.txt",
        data_dir: "espeak-ng-data",
    }),
    speakers: &[(0, "LJSpeech")],
    links: ModelLinks {
        card_repo: None,
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/matcha.html"),
    },
};

const PIPER_LIBRITTS_R_MEDIUM: SpeechRecipe = SpeechRecipe {
    id: "piper-libritts-r-medium",
    name: "Piper LibriTTS-R medium (US English)",
    description: "Balanced, Piper's LibriTTS-R model with 904 speakers, of which the first 40 are offered. English only, about 82 MB download.",
    license: "CC-BY-4.0",
    license_url: CC_BY_LICENSE_URL,
    delivery: Delivery::Archive {
        archive_name: "vits-piper-en_US-libritts_r-medium.tar.bz2",
    },
    release_tag: SPEECH_SYNTHESIS_TAG,
    size_bytes: 82_038_311,
    languages: &["en-US"],
    engine: Engine::Tts(TtsEngine::Vits {
        model: "en_US-libritts_r-medium.onnx",
        tokens: "tokens.txt",
        data_dir: "espeak-ng-data",
    }),
    speakers: LIBRITTS_SPEAKERS,
    links: ModelLinks {
        card_repo: Some("rhasspy/piper-voices"),
        source_url: "https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models",
        docs_url: Some("https://k2-fsa.github.io/sherpa/onnx/tts/piper.html"),
    },
};

/// The speech to text and text to speech models, grouped by task and sorted small to large within
/// each group, in the order the Playground lists them.
pub(super) const RECIPES: &[SpeechRecipe] = &[
    MOONSHINE_TINY_EN,
    MOONSHINE_BASE_EN,
    WHISPER_TINY_EN,
    SENSE_VOICE_INT8,
    WHISPER_BASE_MULTI,
    WHISPER_BASE_EN,
    PARAKEET_TDT_V3_INT8,
    WHISPER_TURBO,
    WHISPER_SMALL_EN,
    KITTEN_NANO_V02_FP16,
    PIPER_GLADOS,
    PIPER_LESSAC_MEDIUM,
    MATCHA_LJSPEECH,
    PIPER_LIBRITTS_R_MEDIUM,
    POCKET_TTS_INT8,
    SUPERTONIC_3_INT8,
    KOKORO_MULTI_V1,
];

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
    /// True for a voice cloning model: a synthesis needs a reference recording, and `voices` is empty.
    pub needs_reference: bool,
    pub links: ModelLinks,
}

impl SpeechRecipe {
    /// True when the model clones the voice of a reference recording instead of offering voices.
    pub(super) fn needs_reference(&self) -> bool {
        matches!(self.engine, Engine::Tts(TtsEngine::PocketTts { .. }))
    }

    /// The second release asset the model needs, when it has one: a Matcha model's vocoder.
    pub(super) fn companion(&self) -> Option<Companion> {
        match self.engine {
            Engine::Tts(TtsEngine::Matcha { vocoder, .. }) => Some(vocoder),
            _ => None,
        }
    }

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
            .filter_map(|(id, code)| self.engine.speaker_voice(*id, code))
            .collect()
    }

    /// The voice with this id, when the model offers one.
    pub(super) fn voice(&self, voice_id: u32) -> Option<SpeechVoice> {
        self.voices().into_iter().find(|voice| voice.id == voice_id)
    }
}

/// The voice for a Kokoro speaker code such as `af_heart`: the region and gender come from its
/// prefix, the name from the rest. None for a code with another prefix.
fn kokoro_voice(id: u32, code: &str) -> Option<SpeechVoice> {
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

/// The voice for a Kitten speaker name such as `expr-voice-2-f`: the number comes from the name and
/// the gender from its last letter. None for a name of another shape.
fn kitten_voice(id: u32, code: &str) -> Option<SpeechVoice> {
    let (stem, suffix) = code.rsplit_once('-')?;
    let gender = match suffix {
        "m" => "male",
        "f" => "female",
        _ => return None,
    };
    let number = stem.strip_prefix("expr-voice-")?;
    let name = format!("Expr voice {number}");
    Some(SpeechVoice {
        id,
        label: format!("{name} ({gender})"),
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
        needs_reference: recipe.needs_reference(),
        links: recipe.links,
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

/// The GitHub release asset a companion file is fetched from.
pub(super) fn companion_url(companion: Companion) -> String {
    format!(
        "{RELEASE_PREFIX}{}/{}",
        companion.release_tag, companion.file_name
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
            download_url(&POCKET_TTS_INT8),
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-pocket-tts-int8-2026-01-26.tar.bz2"
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
        assert_eq!(kokoro_voice(28, "ef_dora"), None);
        assert_eq!(kokoro_voice(0, "nounderscore"), None);
    }

    #[test]
    fn supertonic_offers_ten_numbered_english_voices() {
        let voices = SUPERTONIC_3_INT8.voices();
        assert_eq!(voices.len(), 10);
        assert_eq!(voices[0].id, 0);
        assert_eq!(voices[9].id, 9);
        let first = SUPERTONIC_3_INT8.voice(0).expect("voice 0");
        assert_eq!(first.name, "Voice 0");
        assert_eq!(first.label, "Voice 0");
        assert!(SUPERTONIC_3_INT8.voice(10).is_none(), "ids run 0 to 9");
        assert_eq!(SUPERTONIC_3_INT8.languages, ["en"]);
        assert_eq!(SUPERTONIC_3_INT8.kind(), SpeechKind::Tts);
        assert!(!SUPERTONIC_3_INT8.needs_reference());
    }

    #[test]
    fn supertonic_names_its_seven_files_and_the_size_is_the_github_size() {
        assert_eq!(
            SUPERTONIC_3_INT8.engine.entries(),
            vec![
                "duration_predictor.int8.onnx",
                "text_encoder.int8.onnx",
                "vector_estimator.int8.onnx",
                "vocoder.int8.onnx",
                "tts.json",
                "unicode_indexer.bin",
                "voice.bin",
            ]
        );
        assert_eq!(SUPERTONIC_3_INT8.size_bytes, 128_774_318);
        assert_eq!(SUPERTONIC_3_INT8.license, "BigScience OpenRAIL-M");
        assert_eq!(SUPERTONIC_3_INT8.license_url, OPENRAIL_M_LICENSE_URL);
        assert_eq!(
            SUPERTONIC_3_INT8.delivery,
            Delivery::Archive {
                archive_name: "sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2"
            }
        );
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
        assert_eq!(
            SENSE_VOICE_INT8.engine.entries(),
            vec!["model.int8.onnx", "tokens.txt"]
        );
        assert_eq!(
            PARAKEET_TDT_V3_INT8.engine.entries(),
            vec![
                "encoder.int8.onnx",
                "decoder.int8.onnx",
                "joiner.int8.onnx",
                "tokens.txt"
            ]
        );
        assert_eq!(WHISPER_TINY_EN.kind(), SpeechKind::Stt);
        assert_eq!(MOONSHINE_BASE_EN.kind(), SpeechKind::Stt);
        assert_eq!(SENSE_VOICE_INT8.kind(), SpeechKind::Stt);
        assert_eq!(PARAKEET_TDT_V3_INT8.kind(), SpeechKind::Stt);
        assert_eq!(KOKORO_MULTI_V1.kind(), SpeechKind::Tts);
    }

    #[test]
    fn archive_names_are_unique_so_no_two_models_share_a_download() {
        let names: HashSet<&str> = all_recipes()
            .filter_map(|recipe| match recipe.delivery {
                Delivery::Archive { archive_name } => Some(archive_name),
                Delivery::SingleFile { .. } => None,
            })
            .collect();
        let archives = all_recipes()
            .filter(|recipe| matches!(recipe.delivery, Delivery::Archive { .. }))
            .count();
        assert_eq!(names.len(), archives);
    }

    #[test]
    fn whisper_and_moonshine_models_are_sherpa_archives_under_their_licences() {
        let added = [
            (&MOONSHINE_TINY_EN, 29_858_559u64, "MIT"),
            (&WHISPER_BASE_EN, 208_576_005, "MIT"),
            (&WHISPER_BASE_MULTI, 207_557_382, "MIT"),
            (&WHISPER_SMALL_EN, 635_693_775, "MIT"),
            (&WHISPER_TURBO, 563_790_207, "MIT"),
        ];
        for (recipe, size, license) in added {
            assert_eq!(recipe.release_tag, SPEECH_RECOGNITION_TAG, "{}", recipe.id);
            assert_eq!(recipe.size_bytes, size, "{}", recipe.id);
            assert_eq!(recipe.license, license, "{}", recipe.id);
            assert_eq!(recipe.kind(), SpeechKind::Stt, "{}", recipe.id);
            assert!(recipe.voices().is_empty(), "{}", recipe.id);
            assert!(
                recipe.asset_name().ends_with(ARCHIVE_ENDING),
                "{}",
                recipe.id
            );
            let speed_tier = ["Fast", "Balanced", "Best quality"]
                .iter()
                .any(|tier| recipe.description.starts_with(tier));
            assert!(speed_tier, "{} must start with its speed tier", recipe.id);
        }
        assert_eq!(MOONSHINE_TINY_EN.license_url, MIT_LICENSE_URL_MOONSHINE);
        assert_eq!(WHISPER_TURBO.license_url, MIT_LICENSE_URL_WHISPER);
        assert_eq!(WHISPER_BASE_EN.languages, ["en"]);
        assert_eq!(WHISPER_BASE_MULTI.languages, ["multi"]);
        assert_eq!(WHISPER_TURBO.languages, ["multi"]);
    }

    #[test]
    fn new_engines_name_the_files_they_read() {
        assert_eq!(
            MOONSHINE_TINY_EN.engine.entries(),
            vec![
                "encoder_model.ort",
                "decoder_model_merged.ort",
                "tokens.txt"
            ]
        );
        assert_eq!(
            WHISPER_BASE_EN.engine.entries(),
            vec![
                "base.en-encoder.int8.onnx",
                "base.en-decoder.int8.onnx",
                "base.en-tokens.txt"
            ]
        );
        assert_eq!(
            WHISPER_BASE_MULTI.engine.entries(),
            vec![
                "base-encoder.int8.onnx",
                "base-decoder.int8.onnx",
                "base-tokens.txt"
            ]
        );
        assert_eq!(
            WHISPER_SMALL_EN.engine.entries(),
            vec![
                "small.en-encoder.int8.onnx",
                "small.en-decoder.int8.onnx",
                "small.en-tokens.txt"
            ]
        );
        assert_eq!(
            WHISPER_TURBO.engine.entries(),
            vec![
                "turbo-encoder.int8.onnx",
                "turbo-decoder.int8.onnx",
                "turbo-tokens.txt"
            ]
        );
    }

    #[test]
    fn parakeet_is_a_25_language_transducer_archive_under_cc_by() {
        assert_eq!(
            PARAKEET_TDT_V3_INT8.delivery,
            Delivery::Archive {
                archive_name: "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2"
            }
        );
        assert_eq!(PARAKEET_TDT_V3_INT8.release_tag, SPEECH_RECOGNITION_TAG);
        assert_eq!(PARAKEET_TDT_V3_INT8.size_bytes, 487_170_055);
        assert_eq!(PARAKEET_TDT_V3_INT8.languages.len(), 25);
        assert!(PARAKEET_TDT_V3_INT8.languages.contains(&"en"));
        assert_eq!(PARAKEET_TDT_V3_INT8.license, "CC-BY-4.0");
        assert_eq!(PARAKEET_TDT_V3_INT8.license_url, CC_BY_LICENSE_URL);
        assert!(PARAKEET_TDT_V3_INT8.voices().is_empty());
    }

    #[test]
    fn sense_voice_is_a_five_language_archive_with_its_own_licence() {
        assert_eq!(
            SENSE_VOICE_INT8.delivery,
            Delivery::Archive {
                archive_name: "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09.tar.bz2"
            }
        );
        assert_eq!(SENSE_VOICE_INT8.release_tag, SPEECH_RECOGNITION_TAG);
        assert_eq!(SENSE_VOICE_INT8.size_bytes, 165_783_878);
        assert_eq!(SENSE_VOICE_INT8.languages, ["zh", "en", "ja", "ko", "yue"]);
        assert_eq!(
            SENSE_VOICE_INT8.license,
            "FunASR Model Open Source License 1.1"
        );
        assert_eq!(SENSE_VOICE_INT8.license_url, FUNASR_LICENSE_URL);
        assert!(SENSE_VOICE_INT8.voices().is_empty());
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
                SpeechKind::Stt,
                SpeechKind::Stt,
                SpeechKind::Stt,
                SpeechKind::Stt,
                SpeechKind::Stt,
                SpeechKind::Stt,
                SpeechKind::Stt,
                SpeechKind::Tts,
                SpeechKind::Tts,
                SpeechKind::Tts,
                SpeechKind::Tts,
                SpeechKind::Tts,
                SpeechKind::Tts,
                SpeechKind::Tts,
                SpeechKind::Tts,
                SpeechKind::Denoise,
                SpeechKind::Denoise,
                SpeechKind::Denoise,
                SpeechKind::Denoise,
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
        assert_eq!(json["needsReference"], false);
        let stt = serde_json::to_value(describe(&WHISPER_TINY_EN, scratch.path())).expect("json");
        assert_eq!(stt["kind"], "stt");
        assert_eq!(stt["voices"], serde_json::json!([]));
    }

    #[test]
    fn piper_kitten_and_matcha_name_their_files_and_sizes() {
        assert_eq!(
            PIPER_LESSAC_MEDIUM.engine.entries(),
            vec!["en_US-lessac-medium.onnx", "tokens.txt", "espeak-ng-data"]
        );
        assert_eq!(
            PIPER_GLADOS.engine.entries(),
            vec!["en_US-glados.onnx", "tokens.txt", "espeak-ng-data"]
        );
        assert_eq!(
            PIPER_LIBRITTS_R_MEDIUM.engine.entries(),
            vec![
                "en_US-libritts_r-medium.onnx",
                "tokens.txt",
                "espeak-ng-data"
            ]
        );
        assert_eq!(
            KITTEN_NANO_V02_FP16.engine.entries(),
            vec![
                "model.fp16.onnx",
                "voices.bin",
                "tokens.txt",
                "espeak-ng-data"
            ]
        );
        assert_eq!(
            MATCHA_LJSPEECH.engine.entries(),
            vec![
                "model-steps-3.onnx",
                "vocos-22khz-univ.onnx",
                "tokens.txt",
                "espeak-ng-data"
            ]
        );
        assert_eq!(PIPER_LESSAC_MEDIUM.size_bytes, 67_230_653);
        assert_eq!(PIPER_GLADOS.size_bytes, 67_208_137);
        assert_eq!(PIPER_LIBRITTS_R_MEDIUM.size_bytes, 82_038_311);
        assert_eq!(MATCHA_LJSPEECH.size_bytes, 76_757_969);
        assert_eq!(KITTEN_NANO_V02_FP16.size_bytes, 26_586_708);
        for recipe in [
            &PIPER_LESSAC_MEDIUM,
            &PIPER_GLADOS,
            &PIPER_LIBRITTS_R_MEDIUM,
            &MATCHA_LJSPEECH,
            &KITTEN_NANO_V02_FP16,
        ] {
            assert_eq!(recipe.kind(), SpeechKind::Tts, "{}", recipe.id);
            assert_eq!(recipe.release_tag, SPEECH_SYNTHESIS_TAG, "{}", recipe.id);
            assert!(
                recipe.asset_name().ends_with(ARCHIVE_ENDING),
                "{}",
                recipe.id
            );
            assert!(!recipe.needs_reference(), "{}", recipe.id);
            let tier = ["Fast", "Balanced", "Best quality"]
                .iter()
                .any(|tier| recipe.description.starts_with(tier));
            assert!(tier, "{} must start with its speed tier", recipe.id);
        }
    }

    #[test]
    fn piper_voices_are_numbered_or_named_one_per_speaker() {
        let libritts = PIPER_LIBRITTS_R_MEDIUM.voices();
        assert_eq!(libritts.len(), 40, "the first 40 of 904 speakers");
        assert_eq!(libritts[0].id, 0);
        assert_eq!(libritts[39].id, 39);
        assert_eq!(libritts[7].label, "Voice 7");
        assert!(PIPER_LIBRITTS_R_MEDIUM.voice(40).is_none());
        assert_eq!(PIPER_LESSAC_MEDIUM.voices().len(), 1);
        assert_eq!(PIPER_LESSAC_MEDIUM.voice(0).expect("lessac").name, "Lessac");
        assert_eq!(PIPER_GLADOS.voice(0).expect("glados").label, "GLaDOS");
        assert_eq!(MATCHA_LJSPEECH.voice(0).expect("matcha").name, "LJSpeech");
        assert_eq!(PIPER_LIBRITTS_R_MEDIUM.languages, ["en-US"]);
    }

    #[test]
    fn kitten_offers_eight_named_voices_with_their_gender() {
        let voices = KITTEN_NANO_V02_FP16.voices();
        assert_eq!(voices.len(), 8);
        assert_eq!(voices[0].label, "Expr voice 2 (male)");
        assert_eq!(voices[1].label, "Expr voice 2 (female)");
        assert_eq!(voices[7].name, "Expr voice 5");
        assert!(KITTEN_NANO_V02_FP16.voice(8).is_none());
        assert_eq!(kitten_voice(0, "expr-voice-2"), None);
        assert_eq!(kitten_voice(0, "other-voice-2-m"), None);
        assert_eq!(kitten_voice(0, "expr-voice-2-x"), None);
    }

    #[test]
    fn matcha_needs_its_vocoder_from_the_vocoder_release() {
        assert_eq!(MATCHA_LJSPEECH.companion(), Some(VOCOS_22KHZ));
        assert_eq!(PIPER_LESSAC_MEDIUM.companion(), None);
        assert_eq!(
            companion_url(VOCOS_22KHZ),
            "https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos-22khz-univ.onnx"
        );
        assert!(is_allowed_speech_url(&companion_url(VOCOS_22KHZ)));
        let base = "https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/";
        assert!(!is_allowed_speech_url(&format!("{base}vocoder.tar.bz2")));
        assert!(!is_allowed_speech_url(&format!("{base}../vocoder.onnx")));
        assert_eq!(VOCOS_22KHZ.size_bytes, 53_884_024);
    }

    #[test]
    fn matcha_is_downloaded_only_with_its_vocoder_on_disk() {
        let scratch = Scratch::new("speech-matcha");
        let root = scratch.path();
        let folder = model_dir(root, &MATCHA_LJSPEECH);
        std::fs::create_dir_all(&folder).expect("folder");
        for entry in ["model-steps-3.onnx", "tokens.txt"] {
            std::fs::write(folder.join(entry), b"x").expect("file");
        }
        std::fs::create_dir_all(folder.join("espeak-ng-data")).expect("data");
        assert!(!is_downloaded(&MATCHA_LJSPEECH, root), "no vocoder yet");
        std::fs::write(folder.join("vocos-22khz-univ.onnx"), b"x").expect("vocoder");
        assert!(is_downloaded(&MATCHA_LJSPEECH, root));
    }

    #[test]
    fn the_new_tts_licences_are_stated_as_found_or_unclear() {
        assert_eq!(KITTEN_NANO_V02_FP16.license, "Apache-2.0");
        assert_eq!(PIPER_LIBRITTS_R_MEDIUM.license, "CC-BY-4.0");
        assert_eq!(PIPER_LIBRITTS_R_MEDIUM.license_url, CC_BY_LICENSE_URL);
        assert!(PIPER_LESSAC_MEDIUM.license.starts_with("Unclear"));
        assert!(PIPER_GLADOS.license.starts_with("Unclear"));
        assert!(MATCHA_LJSPEECH.license.starts_with("Unclear"));
    }

    #[test]
    fn each_task_group_is_sorted_small_to_large() {
        for kind in [SpeechKind::Stt, SpeechKind::Tts] {
            let sizes: Vec<u64> = RECIPES
                .iter()
                .filter(|recipe| recipe.kind() == kind)
                .map(|recipe| recipe.size_bytes)
                .collect();
            assert!(sizes.windows(2).all(|pair| pair[0] <= pair[1]), "{kind:?}");
        }
    }

    #[test]
    fn pocket_tts_is_a_cloning_model_with_no_voices() {
        let scratch = Scratch::new("speech-pocket");
        assert_eq!(POCKET_TTS_INT8.kind(), SpeechKind::Tts);
        assert!(POCKET_TTS_INT8.voices().is_empty());
        assert!(POCKET_TTS_INT8.needs_reference());
        assert!(!KOKORO_MULTI_V1.needs_reference());
        assert_eq!(POCKET_TTS_INT8.engine.entries().len(), 7);
        let json = serde_json::to_value(describe(&POCKET_TTS_INT8, scratch.path())).expect("json");
        assert_eq!(json["id"], "pocket-tts-int8");
        assert_eq!(json["sizeBytes"], 98_336_520u64);
        assert_eq!(json["needsReference"], true);
        assert_eq!(json["voices"], serde_json::json!([]));
        assert_eq!(
            json["license"],
            "Non-commercial (Kyutai Pocket TTS, ONNX export)"
        );
    }

    #[test]
    fn every_speech_and_audio_recipe_links_to_its_source_and_docs() {
        for recipe in all_recipes() {
            super::super::model_links::assert_well_formed(recipe.id, &recipe.links);
        }
    }

    #[test]
    fn the_listing_carries_the_links() {
        let scratch = Scratch::new("speech-links");
        let listed = describe(&KOKORO_MULTI_V1, scratch.path());
        assert_eq!(listed.links, KOKORO_MULTI_V1.links);
        let json = serde_json::to_value(&listed).expect("json");
        assert_eq!(json["links"]["cardRepo"], "hexgrad/Kokoro-82M");
        assert_eq!(json["links"]["sourceUrl"], KOKORO_MULTI_V1.links.source_url);
    }
}
