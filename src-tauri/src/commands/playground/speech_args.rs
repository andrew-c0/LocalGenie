//! What the webview asks for in a speech job, checked, and the sherpa-onnx argument lists the job
//! runs with. The arguments name only files inside the model's folder, so nothing from the request
//! reaches a path that is not checked first.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::speech_catalog::{SttEngine, TtsEngine};

/// Longest text to speech request, in characters after whitespace is collapsed.
pub(super) const MAX_TTS_CHARS: usize = 2000;
/// Slowest and fastest speech rate a request may ask for.
pub(super) const MIN_SPEED: f32 = 0.5;
pub(super) const MAX_SPEED: f32 = 2.0;
/// Threads the sherpa-onnx programs run the network with.
pub(super) const NUM_THREADS: u32 = 4;
/// The one extension sherpa-onnx reads for speech input, and the one written for speech output.
pub(super) const WAV_EXTENSION: &str = "wav";

/// `playground_transcribe`: a WAV file to turn into text with a speech to text model.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeRequest {
    pub job_id: String,
    pub model_id: String,
    pub audio_path: String,
}

/// `playground_synthesize`: text to read aloud with a text to speech model.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SynthesizeRequest {
    pub job_id: String,
    pub model_id: String,
    pub text: String,
    pub voice_id: u32,
    pub speed: f32,
    /// The recording a voice cloning model copies the voice of. Ignored by models with voices.
    #[serde(default)]
    pub reference_audio_path: Option<String>,
}

/// The text as the program is given it. The command line cannot carry non-ASCII text (sherpa-onnx
/// reads it as mangled bytes), so accents and typographic punctuation are written in ASCII and any
/// other character becomes a space. Whitespace runs become one space. Fails when nothing is left,
/// or when it is longer than `MAX_TTS_CHARS`.
pub(super) fn checked_text(text: &str) -> Result<String, String> {
    let mut ascii = String::with_capacity(text.len());
    for c in text.chars() {
        if c.is_ascii() {
            ascii.push(c);
        } else {
            ascii.push_str(ascii_stand_in(c).unwrap_or(" "));
        }
    }
    let collapsed = ascii.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return Err("Type some text to read aloud.".to_string());
    }
    if collapsed.chars().count() > MAX_TTS_CHARS {
        return Err(format!(
            "The text is longer than {MAX_TTS_CHARS} characters. Split it into shorter parts."
        ));
    }
    Ok(collapsed)
}

/// The ASCII text that stands in for a non-ASCII character: the base letter of an accented Latin
/// letter, or the plain punctuation for a typographic mark. None for every other character.
fn ascii_stand_in(c: char) -> Option<&'static str> {
    Some(match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => "a",
        'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => "A",
        'è' | 'é' | 'ê' | 'ë' => "e",
        'È' | 'É' | 'Ê' | 'Ë' => "E",
        'ì' | 'í' | 'î' | 'ï' => "i",
        'Ì' | 'Í' | 'Î' | 'Ï' => "I",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' => "o",
        'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'Ø' => "O",
        'ù' | 'ú' | 'û' | 'ü' => "u",
        'Ù' | 'Ú' | 'Û' | 'Ü' => "U",
        'ç' => "c",
        'Ç' => "C",
        'ñ' => "n",
        'Ñ' => "N",
        'ý' | 'ÿ' => "y",
        'Ý' => "Y",
        'æ' => "ae",
        'Æ' => "AE",
        'œ' => "oe",
        'Œ' => "OE",
        'ß' => "ss",
        '‘' | '’' | '‚' | '′' => "'",
        '“' | '”' | '„' | '″' => "\"",
        '–' | '—' | '‒' => "-",
        '…' => "...",
        _ => return None,
    })
}

/// The speech rate, when it is between `MIN_SPEED` and `MAX_SPEED`. NaN is refused too.
pub(super) fn checked_speed(speed: f32) -> Result<f32, String> {
    if (MIN_SPEED..=MAX_SPEED).contains(&speed) {
        Ok(speed)
    } else {
        Err(format!(
            "The speed must be between {MIN_SPEED} and {MAX_SPEED}."
        ))
    }
}

/// The audio file a speech or audio job reads: it must exist, be a file, and end in `.wav`. The path
/// is returned resolved, with symbolic links followed.
pub(super) fn checked_audio_input(raw: &str) -> Result<PathBuf, String> {
    let path = std::fs::canonicalize(raw).map_err(|_| format!("Audio file not found: {raw}"))?;
    let is_wav = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case(WAV_EXTENSION));
    if !is_wav || !path.is_file() {
        return Err(format!("Only WAV audio can be used here: {raw}"));
    }
    Ok(path)
}

/// The reference recording of a voice cloning request: a WAV file that can be read and is not empty.
/// Returned resolved, with symbolic links followed.
pub(super) fn checked_reference_audio(raw: Option<&str>) -> Result<PathBuf, String> {
    let raw = raw
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .ok_or("Choose a reference recording to clone the voice from.")?;
    let path = checked_audio_input(raw)?;
    let size = std::fs::File::open(&path)
        .and_then(|file| file.metadata())
        .map_err(|e| format!("Cannot read the reference recording {raw}: {e}"))?
        .len();
    if size == 0 {
        return Err(format!("The reference recording is empty: {raw}"));
    }
    Ok(path)
}

/// The language SenseVoice is asked for. `auto` detects it from the audio.
const SENSE_VOICE_LANGUAGE: &str = "auto";
/// The `--model-type` of a NeMo transducer such as Parakeet, as the sherpa-onnx docs name it.
const NEMO_TRANSDUCER_MODEL_TYPE: &str = "nemo_transducer";

/// The arguments for `sherpa-onnx-offline` that transcribe `audio` with the model in `model_dir`.
/// The audio path is last, as sherpa-onnx expects.
pub(super) fn transcribe_args(engine: SttEngine, model_dir: &Path, audio: &Path) -> Vec<String> {
    let file = |name: &str| model_dir.join(name).display().to_string();
    let mut args = match engine {
        SttEngine::Whisper {
            encoder,
            decoder,
            tokens,
        } => vec![
            format!("--whisper-encoder={}", file(encoder)),
            format!("--whisper-decoder={}", file(decoder)),
            format!("--tokens={}", file(tokens)),
        ],
        SttEngine::Moonshine {
            encoder,
            merged_decoder,
            tokens,
        } => vec![
            format!("--moonshine-encoder={}", file(encoder)),
            format!("--moonshine-merged-decoder={}", file(merged_decoder)),
            format!("--tokens={}", file(tokens)),
        ],
        SttEngine::SenseVoice { model, tokens } => vec![
            format!("--sense-voice-model={}", file(model)),
            format!("--tokens={}", file(tokens)),
            format!("--sense-voice-language={SENSE_VOICE_LANGUAGE}"),
            "--sense-voice-use-itn=1".to_string(),
        ],
        SttEngine::NemoTransducer {
            encoder,
            decoder,
            joiner,
            tokens,
        } => vec![
            format!("--encoder={}", file(encoder)),
            format!("--decoder={}", file(decoder)),
            format!("--joiner={}", file(joiner)),
            format!("--tokens={}", file(tokens)),
            format!("--model-type={NEMO_TRANSDUCER_MODEL_TYPE}"),
        ],
    };
    args.push(format!("--num-threads={NUM_THREADS}"));
    args.push(audio.display().to_string());
    args
}

/// How a text to speech job picks the voice: a speaker of a model with voices, or the recording a
/// cloning model copies.
#[derive(Debug, Clone, Copy)]
pub(super) enum VoiceChoice<'a> {
    Speaker { voice_id: u32, speed: f32 },
    Reference(&'a Path),
}

/// The arguments for `sherpa-onnx-offline-tts` that speak `text` with the model in `model_dir`,
/// writing a WAV to `output`. The text is last, as sherpa-onnx expects. Fails when the voice choice
/// is not the kind the engine takes.
pub(super) fn synthesize_args(
    engine: TtsEngine,
    model_dir: &Path,
    text: &str,
    voice: VoiceChoice<'_>,
    output: &Path,
) -> Result<Vec<String>, String> {
    match (engine, voice) {
        (TtsEngine::Kokoro { .. }, VoiceChoice::Speaker { voice_id, speed }) => Ok(kokoro_args(
            engine, model_dir, text, voice_id, speed, output,
        )),
        (TtsEngine::Supertonic { .. }, VoiceChoice::Speaker { voice_id, speed }) => Ok(
            supertonic_args(engine, model_dir, text, voice_id, speed, output),
        ),
        (TtsEngine::Vits { .. }, VoiceChoice::Speaker { voice_id, speed }) => {
            Ok(vits_args(engine, model_dir, text, voice_id, speed, output))
        }
        (TtsEngine::Kitten { .. }, VoiceChoice::Speaker { voice_id, speed }) => Ok(kitten_args(
            engine, model_dir, text, voice_id, speed, output,
        )),
        (TtsEngine::Matcha { .. }, VoiceChoice::Speaker { speed, .. }) => {
            Ok(matcha_args(engine, model_dir, text, speed, output))
        }
        (TtsEngine::PocketTts { .. }, VoiceChoice::Reference(reference)) => {
            Ok(pocket_args(engine, model_dir, text, reference, output))
        }
        _ => Err("The voice choice does not fit this text to speech model.".to_string()),
    }
}

/// The speed as the length scale the sherpa-onnx flags take: the inverse of the speech rate, so a
/// larger scale is slower. `checked_speed` keeps the speed above zero.
fn length_scale(speed: f32) -> f32 {
    1.0 / speed
}

/// The VITS argument list, for the Piper voices: one speaker, the length scale and the espeak-ng
/// data folder.
fn vits_args(
    engine: TtsEngine,
    model_dir: &Path,
    text: &str,
    voice_id: u32,
    speed: f32,
    output: &Path,
) -> Vec<String> {
    let file = |name: &str| model_dir.join(name).display().to_string();
    let TtsEngine::Vits {
        model,
        tokens,
        data_dir,
    } = engine
    else {
        return Vec::new();
    };
    vec![
        format!("--vits-model={}", file(model)),
        format!("--vits-tokens={}", file(tokens)),
        format!("--vits-data-dir={}", file(data_dir)),
        format!("--num-threads={NUM_THREADS}"),
        format!("--sid={voice_id}"),
        format!("--vits-length-scale={}", length_scale(speed)),
        format!("--output-filename={}", output.display()),
        spoken_text_arg(text),
    ]
}

/// The Matcha argument list: the acoustic model, the vocoder that is its own file, the tokens, the
/// espeak-ng data folder and the length scale. Matcha has one voice, so no speaker id is passed.
fn matcha_args(
    engine: TtsEngine,
    model_dir: &Path,
    text: &str,
    speed: f32,
    output: &Path,
) -> Vec<String> {
    let file = |name: &str| model_dir.join(name).display().to_string();
    let TtsEngine::Matcha {
        acoustic_model,
        vocoder,
        tokens,
        data_dir,
    } = engine
    else {
        return Vec::new();
    };
    vec![
        format!("--matcha-acoustic-model={}", file(acoustic_model)),
        format!("--matcha-vocoder={}", file(vocoder.file_name)),
        format!("--matcha-tokens={}", file(tokens)),
        format!("--matcha-data-dir={}", file(data_dir)),
        format!("--num-threads={NUM_THREADS}"),
        format!("--matcha-length-scale={}", length_scale(speed)),
        format!("--output-filename={}", output.display()),
        spoken_text_arg(text),
    ]
}

/// The Kitten argument list: the model, the voice table, the tokens and the espeak-ng data folder,
/// with one speaker and the length scale.
fn kitten_args(
    engine: TtsEngine,
    model_dir: &Path,
    text: &str,
    voice_id: u32,
    speed: f32,
    output: &Path,
) -> Vec<String> {
    let file = |name: &str| model_dir.join(name).display().to_string();
    let TtsEngine::Kitten {
        model,
        voices,
        tokens,
        data_dir,
    } = engine
    else {
        return Vec::new();
    };
    vec![
        format!("--kitten-model={}", file(model)),
        format!("--kitten-voices={}", file(voices)),
        format!("--kitten-tokens={}", file(tokens)),
        format!("--kitten-data-dir={}", file(data_dir)),
        format!("--num-threads={NUM_THREADS}"),
        format!("--sid={voice_id}"),
        format!("--kitten-length-scale={}", length_scale(speed)),
        format!("--output-filename={}", output.display()),
        spoken_text_arg(text),
    ]
}

/// The Pocket TTS argument list: the voice comes from `reference`, with no speaker id or speed.
fn pocket_args(
    engine: TtsEngine,
    model_dir: &Path,
    text: &str,
    reference: &Path,
    output: &Path,
) -> Vec<String> {
    let file = |name: &str| model_dir.join(name).display().to_string();
    let TtsEngine::PocketTts {
        lm_flow,
        lm_main,
        encoder,
        decoder,
        text_conditioner,
        vocab_json,
        token_scores_json,
    } = engine
    else {
        return Vec::new();
    };
    vec![
        format!("--pocket-lm-flow={}", file(lm_flow)),
        format!("--pocket-lm-main={}", file(lm_main)),
        format!("--pocket-encoder={}", file(encoder)),
        format!("--pocket-decoder={}", file(decoder)),
        format!("--pocket-text-conditioner={}", file(text_conditioner)),
        format!("--pocket-vocab-json={}", file(vocab_json)),
        format!("--pocket-token-scores-json={}", file(token_scores_json)),
        format!("--num-threads={NUM_THREADS}"),
        format!("--reference-audio={}", reference.display()),
        format!("--output-filename={}", output.display()),
        spoken_text_arg(text),
    ]
}

/// The Kokoro argument list: one speaker and a speed.
fn kokoro_args(
    engine: TtsEngine,
    model_dir: &Path,
    text: &str,
    voice_id: u32,
    speed: f32,
    output: &Path,
) -> Vec<String> {
    let file = |name: &str| model_dir.join(name).display().to_string();
    let TtsEngine::Kokoro {
        model,
        voices,
        tokens,
        lexicon,
        dict_dir,
    } = engine
    else {
        return Vec::new();
    };
    vec![
        format!("--kokoro-model={}", file(model)),
        format!("--kokoro-voices={}", file(voices)),
        format!("--kokoro-tokens={}", file(tokens)),
        format!("--kokoro-lexicon={}", file(lexicon)),
        format!("--kokoro-dict-dir={}", file(dict_dir)),
        format!("--num-threads={NUM_THREADS}"),
        format!("--sid={voice_id}"),
        format!("--speed={speed}"),
        format!("--output-filename={}", output.display()),
        spoken_text_arg(text),
    ]
}

/// The Supertonic argument list: one speaker, the language and a speed. Each of the seven model files
/// has its own flag.
fn supertonic_args(
    engine: TtsEngine,
    model_dir: &Path,
    text: &str,
    voice_id: u32,
    speed: f32,
    output: &Path,
) -> Vec<String> {
    let file = |name: &str| model_dir.join(name).display().to_string();
    let TtsEngine::Supertonic {
        duration_predictor,
        text_encoder,
        vector_estimator,
        vocoder,
        tts_json,
        unicode_indexer,
        voice_style,
        language,
    } = engine
    else {
        return Vec::new();
    };
    vec![
        format!(
            "--supertonic-duration-predictor={}",
            file(duration_predictor)
        ),
        format!("--supertonic-text-encoder={}", file(text_encoder)),
        format!("--supertonic-vector-estimator={}", file(vector_estimator)),
        format!("--supertonic-vocoder={}", file(vocoder)),
        format!("--supertonic-tts-json={}", file(tts_json)),
        format!("--supertonic-unicode-indexer={}", file(unicode_indexer)),
        format!("--supertonic-voice-style={}", file(voice_style)),
        format!("--lang={language}"),
        format!("--num-threads={NUM_THREADS}"),
        format!("--sid={voice_id}"),
        format!("--speed={speed}"),
        format!("--output-filename={}", output.display()),
        spoken_text_arg(text),
    ]
}

/// The text as a positional argument. A text that starts with `-` would be read as an option, so a
/// space goes in front of it.
fn spoken_text_arg(text: &str) -> String {
    if text.starts_with('-') {
        format!(" {text}")
    } else {
        text.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::playground::speech_catalog::{find_recipe, Engine};

    /// A Windows model folder and audio file, as the app sees them.
    const MODEL_DIR: &str = r"C:\Users\me\AppData\Roaming\LocalGenie\playground-models\k2-fsa--sherpa-onnx\whisper-tiny-en";

    fn stt_engine(id: &str) -> SttEngine {
        match find_recipe(id).expect("recipe").engine {
            Engine::Stt(engine) => engine,
            _ => panic!("{id} is not speech to text"),
        }
    }

    fn tts_engine(id: &str) -> TtsEngine {
        match find_recipe(id).expect("recipe").engine {
            Engine::Tts(engine) => engine,
            _ => panic!("{id} is not text to speech"),
        }
    }

    #[test]
    fn whisper_arguments_are_the_exact_list_with_the_wav_last() {
        let dir = Path::new(MODEL_DIR);
        let wav = Path::new(r"C:\Users\me\Music\clip.wav");
        let args = transcribe_args(stt_engine("whisper-tiny-en"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!(
                    "--whisper-encoder={}",
                    dir.join("tiny.en-encoder.int8.onnx").display()
                ),
                format!(
                    "--whisper-decoder={}",
                    dir.join("tiny.en-decoder.int8.onnx").display()
                ),
                format!("--tokens={}", dir.join("tiny.en-tokens.txt").display()),
                "--num-threads=4".to_string(),
                wav.display().to_string(),
            ]
        );
    }

    #[test]
    fn moonshine_arguments_are_the_exact_list_with_the_wav_last() {
        let dir = Path::new(r"C:\models\moonshine-base-en");
        let wav = Path::new(r"C:\clips\a.wav");
        let args = transcribe_args(stt_engine("moonshine-base-en"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!(
                    "--moonshine-encoder={}",
                    dir.join("encoder_model.ort").display()
                ),
                format!(
                    "--moonshine-merged-decoder={}",
                    dir.join("decoder_model_merged.ort").display()
                ),
                format!("--tokens={}", dir.join("tokens.txt").display()),
                "--num-threads=4".to_string(),
                r"C:\clips\a.wav".to_string(),
            ]
        );
    }

    #[test]
    fn moonshine_tiny_arguments_are_the_exact_list_with_the_wav_last() {
        let dir = Path::new(r"C:\models\moonshine-tiny-en");
        let wav = Path::new(r"C:\clips\tiny.wav");
        let args = transcribe_args(stt_engine("moonshine-tiny-en"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!(
                    "--moonshine-encoder={}",
                    dir.join("encoder_model.ort").display()
                ),
                format!(
                    "--moonshine-merged-decoder={}",
                    dir.join("decoder_model_merged.ort").display()
                ),
                format!("--tokens={}", dir.join("tokens.txt").display()),
                "--num-threads=4".to_string(),
                r"C:\clips\tiny.wav".to_string(),
            ]
        );
    }

    #[test]
    fn whisper_base_english_arguments_name_its_own_files_with_the_wav_last() {
        let dir = Path::new(r"C:\models\whisper-base-en");
        let wav = Path::new(r"C:\clips\base.wav");
        let args = transcribe_args(stt_engine("whisper-base-en"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!(
                    "--whisper-encoder={}",
                    dir.join("base.en-encoder.int8.onnx").display()
                ),
                format!(
                    "--whisper-decoder={}",
                    dir.join("base.en-decoder.int8.onnx").display()
                ),
                format!("--tokens={}", dir.join("base.en-tokens.txt").display()),
                "--num-threads=4".to_string(),
                r"C:\clips\base.wav".to_string(),
            ]
        );
    }

    #[test]
    fn whisper_base_multilingual_arguments_name_its_own_files_with_the_wav_last() {
        let dir = Path::new(r"C:\models\whisper-base");
        let wav = Path::new(r"C:\clips\fr.wav");
        let args = transcribe_args(stt_engine("whisper-base"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!(
                    "--whisper-encoder={}",
                    dir.join("base-encoder.int8.onnx").display()
                ),
                format!(
                    "--whisper-decoder={}",
                    dir.join("base-decoder.int8.onnx").display()
                ),
                format!("--tokens={}", dir.join("base-tokens.txt").display()),
                "--num-threads=4".to_string(),
                r"C:\clips\fr.wav".to_string(),
            ]
        );
    }

    #[test]
    fn whisper_small_english_arguments_name_its_own_files_with_the_wav_last() {
        let dir = Path::new(r"C:\models\whisper-small-en");
        let wav = Path::new(r"C:\clips\small.wav");
        let args = transcribe_args(stt_engine("whisper-small-en"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!(
                    "--whisper-encoder={}",
                    dir.join("small.en-encoder.int8.onnx").display()
                ),
                format!(
                    "--whisper-decoder={}",
                    dir.join("small.en-decoder.int8.onnx").display()
                ),
                format!("--tokens={}", dir.join("small.en-tokens.txt").display()),
                "--num-threads=4".to_string(),
                r"C:\clips\small.wav".to_string(),
            ]
        );
    }

    #[test]
    fn whisper_turbo_arguments_name_its_own_files_with_the_wav_last() {
        let dir = Path::new(r"C:\models\whisper-turbo");
        let wav = Path::new(r"C:\clips\turbo.wav");
        let args = transcribe_args(stt_engine("whisper-turbo"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!(
                    "--whisper-encoder={}",
                    dir.join("turbo-encoder.int8.onnx").display()
                ),
                format!(
                    "--whisper-decoder={}",
                    dir.join("turbo-decoder.int8.onnx").display()
                ),
                format!("--tokens={}", dir.join("turbo-tokens.txt").display()),
                "--num-threads=4".to_string(),
                r"C:\clips\turbo.wav".to_string(),
            ]
        );
    }

    #[test]
    fn sense_voice_arguments_detect_the_language_and_turn_itn_on() {
        let dir = Path::new(r"C:\models\sense-voice-int8");
        let wav = Path::new(r"C:\clips\yue.wav");
        let args = transcribe_args(stt_engine("sense-voice-int8"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!(
                    "--sense-voice-model={}",
                    dir.join("model.int8.onnx").display()
                ),
                format!("--tokens={}", dir.join("tokens.txt").display()),
                "--sense-voice-language=auto".to_string(),
                "--sense-voice-use-itn=1".to_string(),
                "--num-threads=4".to_string(),
                r"C:\clips\yue.wav".to_string(),
            ]
        );
    }

    #[test]
    fn parakeet_arguments_name_the_four_transducer_files_and_the_model_type() {
        let dir = Path::new(r"C:\models\parakeet-tdt-v3-int8");
        let wav = Path::new(r"C:\clips\de.wav");
        let args = transcribe_args(stt_engine("parakeet-tdt-v3-int8"), dir, wav);
        assert_eq!(
            args,
            vec![
                format!("--encoder={}", dir.join("encoder.int8.onnx").display()),
                format!("--decoder={}", dir.join("decoder.int8.onnx").display()),
                format!("--joiner={}", dir.join("joiner.int8.onnx").display()),
                format!("--tokens={}", dir.join("tokens.txt").display()),
                "--model-type=nemo_transducer".to_string(),
                "--num-threads=4".to_string(),
                r"C:\clips\de.wav".to_string(),
            ]
        );
    }

    #[test]
    fn kokoro_arguments_are_the_exact_list_with_the_text_last() {
        let dir = Path::new(r"C:\models\kokoro-int8-multi-v1");
        let output = Path::new(r"C:\Users\me\Music\LocalGenie\speech-hello-20261029-101112.wav");
        let args = synthesize_args(
            tts_engine("kokoro-int8-multi-v1"),
            dir,
            "Hello from LocalGenie.",
            VoiceChoice::Speaker {
                voice_id: 3,
                speed: 1.5,
            },
            output,
        )
        .expect("kokoro args");
        assert_eq!(
            args,
            vec![
                format!("--kokoro-model={}", dir.join("model.int8.onnx").display()),
                format!("--kokoro-voices={}", dir.join("voices.bin").display()),
                format!("--kokoro-tokens={}", dir.join("tokens.txt").display()),
                format!(
                    "--kokoro-lexicon={}",
                    dir.join("lexicon-us-en.txt").display()
                ),
                format!("--kokoro-dict-dir={}", dir.join("dict").display()),
                "--num-threads=4".to_string(),
                "--sid=3".to_string(),
                "--speed=1.5".to_string(),
                format!("--output-filename={}", output.display()),
                "Hello from LocalGenie.".to_string(),
            ]
        );
    }

    #[test]
    fn pocket_arguments_are_the_exact_list_with_the_text_last() {
        let dir = Path::new(r"C:\models\pocket-tts-int8");
        let reference = Path::new(r"C:\clips\me.wav");
        let output = Path::new(r"C:\Users\me\Music\LocalGenie\speech-hi-20261029-101112.wav");
        let args = synthesize_args(
            tts_engine("pocket-tts-int8"),
            dir,
            "Hello there.",
            VoiceChoice::Reference(reference),
            output,
        )
        .expect("pocket args");
        let file = |name: &str| dir.join(name).display().to_string();
        assert_eq!(
            args,
            vec![
                format!("--pocket-lm-flow={}", file("lm_flow.int8.onnx")),
                format!("--pocket-lm-main={}", file("lm_main.int8.onnx")),
                format!("--pocket-encoder={}", file("encoder.onnx")),
                format!("--pocket-decoder={}", file("decoder.int8.onnx")),
                format!(
                    "--pocket-text-conditioner={}",
                    file("text_conditioner.onnx")
                ),
                format!("--pocket-vocab-json={}", file("vocab.json")),
                format!("--pocket-token-scores-json={}", file("token_scores.json")),
                "--num-threads=4".to_string(),
                format!("--reference-audio={}", reference.display()),
                format!("--output-filename={}", output.display()),
                "Hello there.".to_string(),
            ]
        );
    }

    #[test]
    fn supertonic_arguments_pick_the_speaker_language_and_speed_with_the_text_last() {
        let dir = Path::new(r"C:\models\supertonic-3-int8");
        let output = Path::new(r"C:\Users\me\Music\LocalGenie\speech-hi-20261106-101112.wav");
        let args = synthesize_args(
            tts_engine("supertonic-3-int8"),
            dir,
            "Good morning.",
            VoiceChoice::Speaker {
                voice_id: 6,
                speed: 1.25,
            },
            output,
        )
        .expect("supertonic args");
        let file = |name: &str| dir.join(name).display().to_string();
        assert_eq!(
            args,
            vec![
                format!(
                    "--supertonic-duration-predictor={}",
                    file("duration_predictor.int8.onnx")
                ),
                format!(
                    "--supertonic-text-encoder={}",
                    file("text_encoder.int8.onnx")
                ),
                format!(
                    "--supertonic-vector-estimator={}",
                    file("vector_estimator.int8.onnx")
                ),
                format!("--supertonic-vocoder={}", file("vocoder.int8.onnx")),
                format!("--supertonic-tts-json={}", file("tts.json")),
                format!(
                    "--supertonic-unicode-indexer={}",
                    file("unicode_indexer.bin")
                ),
                format!("--supertonic-voice-style={}", file("voice.bin")),
                "--lang=en".to_string(),
                "--num-threads=4".to_string(),
                "--sid=6".to_string(),
                "--speed=1.25".to_string(),
                format!("--output-filename={}", output.display()),
                "Good morning.".to_string(),
            ]
        );
    }

    #[test]
    fn vits_arguments_are_the_exact_list_with_the_text_last() {
        let dir = Path::new(r"C:\models\piper-libritts-r-medium");
        let output = Path::new(r"C:\Music\LocalGenie\speech-hi-20261106-101112.wav");
        let args = synthesize_args(
            tts_engine("piper-libritts-r-medium"),
            dir,
            "Hello there.",
            VoiceChoice::Speaker {
                voice_id: 7,
                speed: 1.25,
            },
            output,
        )
        .expect("vits args");
        let file = |name: &str| dir.join(name).display().to_string();
        assert_eq!(
            args,
            vec![
                format!("--vits-model={}", file("en_US-libritts_r-medium.onnx")),
                format!("--vits-tokens={}", file("tokens.txt")),
                format!("--vits-data-dir={}", file("espeak-ng-data")),
                "--num-threads=4".to_string(),
                "--sid=7".to_string(),
                "--vits-length-scale=0.8".to_string(),
                format!("--output-filename={}", output.display()),
                "Hello there.".to_string(),
            ]
        );
    }

    #[test]
    fn piper_single_voice_arguments_pass_the_speaker_zero_and_the_speed_as_length_scale() {
        let dir = Path::new(r"C:\models\piper-glados");
        let args = synthesize_args(
            tts_engine("piper-glados"),
            dir,
            "Test subject.",
            VoiceChoice::Speaker {
                voice_id: 0,
                speed: 0.5,
            },
            Path::new("o.wav"),
        )
        .expect("glados args");
        assert!(args.contains(&"--vits-length-scale=2".to_string()));
        assert!(args.contains(&"--sid=0".to_string()));
        assert!(args[0].ends_with("en_US-glados.onnx"), "{}", args[0]);
    }

    #[test]
    fn matcha_arguments_name_the_separate_vocoder_and_have_no_speaker_id() {
        let dir = Path::new(r"C:\models\matcha-ljspeech");
        let output = Path::new(r"C:\Music\LocalGenie\speech-hi-20261106-101112.wav");
        let args = synthesize_args(
            tts_engine("matcha-ljspeech"),
            dir,
            "Good morning.",
            VoiceChoice::Speaker {
                voice_id: 0,
                speed: 1.0,
            },
            output,
        )
        .expect("matcha args");
        let file = |name: &str| dir.join(name).display().to_string();
        assert_eq!(
            args,
            vec![
                format!("--matcha-acoustic-model={}", file("model-steps-3.onnx")),
                format!("--matcha-vocoder={}", file("vocos-22khz-univ.onnx")),
                format!("--matcha-tokens={}", file("tokens.txt")),
                format!("--matcha-data-dir={}", file("espeak-ng-data")),
                "--num-threads=4".to_string(),
                "--matcha-length-scale=1".to_string(),
                format!("--output-filename={}", output.display()),
                "Good morning.".to_string(),
            ]
        );
    }

    #[test]
    fn kitten_arguments_pick_the_speaker_and_the_length_scale() {
        let dir = Path::new(r"C:\models\kitten-nano-en-v0-2-fp16");
        let output = Path::new(r"C:\Music\LocalGenie\speech-hi-20261106-101112.wav");
        let args = synthesize_args(
            tts_engine("kitten-nano-en-v0-2-fp16"),
            dir,
            "Hello.",
            VoiceChoice::Speaker {
                voice_id: 3,
                speed: 1.0,
            },
            output,
        )
        .expect("kitten args");
        let file = |name: &str| dir.join(name).display().to_string();
        assert_eq!(
            args,
            vec![
                format!("--kitten-model={}", file("model.fp16.onnx")),
                format!("--kitten-voices={}", file("voices.bin")),
                format!("--kitten-tokens={}", file("tokens.txt")),
                format!("--kitten-data-dir={}", file("espeak-ng-data")),
                "--num-threads=4".to_string(),
                "--sid=3".to_string(),
                "--kitten-length-scale=1".to_string(),
                format!("--output-filename={}", output.display()),
                "Hello.".to_string(),
            ]
        );
    }

    #[test]
    fn the_new_engines_refuse_a_reference_recording() {
        let out = Path::new("o.wav");
        let reference = VoiceChoice::Reference(Path::new("r.wav"));
        for id in [
            "piper-glados",
            "matcha-ljspeech",
            "kitten-nano-en-v0-2-fp16",
        ] {
            assert!(
                synthesize_args(tts_engine(id), Path::new("m"), "a", reference, out).is_err(),
                "{id}"
            );
        }
    }

    #[test]
    fn a_voice_choice_of_the_wrong_kind_is_refused() {
        let out = Path::new("o.wav");
        let speaker = VoiceChoice::Speaker {
            voice_id: 0,
            speed: 1.0,
        };
        let pocket = tts_engine("pocket-tts-int8");
        assert!(synthesize_args(pocket, Path::new("m"), "a", speaker, out).is_err());
        let kokoro = tts_engine("kokoro-int8-multi-v1");
        let reference = VoiceChoice::Reference(Path::new("r.wav"));
        assert!(synthesize_args(kokoro, Path::new("m"), "a", reference, out).is_err());
        let supertonic = tts_engine("supertonic-3-int8");
        assert!(synthesize_args(supertonic, Path::new("m"), "a", reference, out).is_err());
    }

    #[test]
    fn the_reference_recording_must_be_a_readable_non_empty_wav() {
        let scratch = crate::commands::playground::test_support::Scratch::new("speech-reference");
        let wav = scratch.path().join("ref.wav");
        std::fs::write(&wav, b"RIFF").expect("wav");
        let empty = scratch.path().join("empty.wav");
        std::fs::write(&empty, b"").expect("empty");
        let txt = scratch.path().join("ref.txt");
        std::fs::write(&txt, b"x").expect("txt");
        let missing = scratch.path().join("missing.wav");

        assert!(checked_reference_audio(Some(&wav.to_string_lossy())).is_ok());
        assert!(checked_reference_audio(None).is_err());
        assert!(checked_reference_audio(Some("  ")).is_err());
        assert!(checked_reference_audio(Some(&empty.to_string_lossy())).is_err());
        assert!(checked_reference_audio(Some(&txt.to_string_lossy())).is_err());
        assert!(checked_reference_audio(Some(&missing.to_string_lossy())).is_err());
    }

    #[test]
    fn text_that_starts_with_a_dash_is_not_read_as_an_option() {
        assert_eq!(spoken_text_arg("-5 degrees"), " -5 degrees");
        assert_eq!(spoken_text_arg("Five degrees"), "Five degrees");
        let args = synthesize_args(
            tts_engine("kokoro-int8-multi-v1"),
            Path::new("m"),
            "--help",
            VoiceChoice::Speaker {
                voice_id: 0,
                speed: 1.0,
            },
            Path::new("o.wav"),
        )
        .expect("kokoro args");
        assert_eq!(args.last().map(String::as_str), Some(" --help"));
    }

    #[test]
    fn text_is_trimmed_and_whitespace_runs_become_one_space() {
        assert_eq!(
            checked_text("  Hello\n\nthere \t you  ").as_deref(),
            Ok("Hello there you")
        );
        assert!(checked_text(" \n\t ").is_err());
        assert!(checked_text("").is_err());
    }

    #[test]
    fn accents_and_typographic_marks_are_written_in_ascii() {
        assert_eq!(
            checked_text("Café naïve, Zoë’s crème brûlée — “yes”… Straße").as_deref(),
            Ok("Cafe naive, Zoe's creme brulee - \"yes\"... Strasse")
        );
        // A character with no stand-in becomes a space rather than a broken byte.
        assert_eq!(checked_text("a☕b").as_deref(), Ok("a b"));
        assert!(checked_text("☕☕").is_err(), "nothing speakable is left");
    }

    #[test]
    fn text_longer_than_the_limit_is_refused_and_the_limit_itself_is_fine() {
        let at_limit = "a".repeat(MAX_TTS_CHARS);
        assert_eq!(checked_text(&at_limit).map(|t| t.len()), Ok(MAX_TTS_CHARS));
        let over = "a".repeat(MAX_TTS_CHARS + 1);
        let error = checked_text(&over).expect_err("too long");
        assert!(error.contains("2000 characters"), "{error}");
    }

    #[test]
    fn speed_is_checked_against_the_range() {
        assert_eq!(checked_speed(0.5), Ok(0.5));
        assert_eq!(checked_speed(2.0), Ok(2.0));
        assert!(checked_speed(0.49).is_err());
        assert!(checked_speed(2.01).is_err());
        assert!(checked_speed(f32::NAN).is_err());
    }

    #[test]
    fn requests_deserialise_from_the_camel_case_the_webview_sends() {
        let transcribe: TranscribeRequest = serde_json::from_value(serde_json::json!({
            "jobId": "job-1",
            "modelId": "whisper-tiny-en",
            "audioPath": "C:\\clips\\a.wav"
        }))
        .expect("transcribe");
        assert_eq!(transcribe.job_id, "job-1");
        assert_eq!(transcribe.audio_path, "C:\\clips\\a.wav");

        let synth: SynthesizeRequest = serde_json::from_value(serde_json::json!({
            "jobId": "job-2",
            "modelId": "kokoro-int8-multi-v1",
            "text": "Hi",
            "voiceId": 3,
            "speed": 1.0
        }))
        .expect("synthesize");
        assert_eq!(synth.voice_id, 3);
        assert_eq!(synth.speed, 1.0);
        assert_eq!(synth.reference_audio_path, None);
        let cloned: SynthesizeRequest = serde_json::from_value(serde_json::json!({
            "jobId": "job-3",
            "modelId": "pocket-tts-int8",
            "text": "Hi",
            "voiceId": 0,
            "speed": 1.0,
            "referenceAudioPath": "C:\\clips\\me.wav"
        }))
        .expect("synthesize with reference");
        assert_eq!(
            cloned.reference_audio_path.as_deref(),
            Some("C:\\clips\\me.wav")
        );
    }

    #[test]
    fn audio_input_must_be_an_existing_wav_file() {
        let scratch = crate::commands::playground::test_support::Scratch::new("speech-input");
        let wav = scratch.path().join("clip.WAV");
        std::fs::write(&wav, b"RIFF").expect("wav");
        let txt = scratch.path().join("notes.txt");
        std::fs::write(&txt, b"text").expect("txt");

        assert!(checked_audio_input(&wav.to_string_lossy()).is_ok());
        assert!(checked_audio_input(&txt.to_string_lossy()).is_err());
        assert!(checked_audio_input(&scratch.path().to_string_lossy()).is_err());
        assert!(
            checked_audio_input(&scratch.path().join("missing.wav").to_string_lossy()).is_err()
        );
    }
}
