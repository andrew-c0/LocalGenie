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
const NUM_THREADS: u32 = 4;
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

/// The audio file a transcription reads: it must exist, be a file, and end in `.wav`. The path is
/// returned resolved, with symbolic links followed.
pub(super) fn checked_audio_input(raw: &str) -> Result<PathBuf, String> {
    let path = std::fs::canonicalize(raw).map_err(|_| format!("Audio file not found: {raw}"))?;
    let is_wav = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case(WAV_EXTENSION));
    if !is_wav || !path.is_file() {
        return Err(format!("Only WAV audio can be transcribed: {raw}"));
    }
    Ok(path)
}

/// The arguments for `sherpa-onnx-offline` that transcribe `audio` with the Whisper or Moonshine
/// model in `model_dir`. The audio path is last, as sherpa-onnx expects.
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
    };
    args.push(format!("--num-threads={NUM_THREADS}"));
    args.push(audio.display().to_string());
    args
}

/// The arguments for `sherpa-onnx-offline-tts` that speak `text` with one voice of the Kokoro model
/// in `model_dir`, writing a WAV to `output`. The text is last, as sherpa-onnx expects.
pub(super) fn synthesize_args(
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
    } = engine;
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
            Engine::Tts(_) => panic!("{id} is not speech to text"),
        }
    }

    fn tts_engine(id: &str) -> TtsEngine {
        match find_recipe(id).expect("recipe").engine {
            Engine::Tts(engine) => engine,
            Engine::Stt(_) => panic!("{id} is not text to speech"),
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
    fn kokoro_arguments_are_the_exact_list_with_the_text_last() {
        let dir = Path::new(r"C:\models\kokoro-int8-multi-v1");
        let output = Path::new(r"C:\Users\me\Music\LocalGenie\speech-hello-20261029-101112.wav");
        let args = synthesize_args(
            tts_engine("kokoro-int8-multi-v1"),
            dir,
            "Hello from LocalGenie.",
            3,
            1.5,
            output,
        );
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
    fn text_that_starts_with_a_dash_is_not_read_as_an_option() {
        assert_eq!(spoken_text_arg("-5 degrees"), " -5 degrees");
        assert_eq!(spoken_text_arg("Five degrees"), "Five degrees");
        let args = synthesize_args(
            tts_engine("kokoro-int8-multi-v1"),
            Path::new("m"),
            "--help",
            0,
            1.0,
            Path::new("o.wav"),
        );
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
