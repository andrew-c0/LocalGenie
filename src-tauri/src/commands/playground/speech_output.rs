//! Reads what a finished sherpa-onnx run printed and decides how the job ended. The transcript of a
//! speech to text run is the one stdout line that starts with `{"lang"`, a JSON object whose `text`
//! field holds the words.

use super::speech_catalog::SpeechKind;

/// The start of the JSON line that holds a transcript.
const TRANSCRIPT_LINE_START: &str = "{\"lang\"";
/// Most output lines shown under a failure.
const MAX_DETAIL_LINES: usize = 3;
/// Longer lines are left out of a failure's detail: sherpa-onnx prints its whole config on one line.
const MAX_DETAIL_CHARS: usize = 300;
/// Words that mark a line as naming an error.
const ERROR_WORDS: &[&str] = &["error", "failed", "expected", "cannot", "invalid"];

/// How a speech job ended, before it is turned into an event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum SpeechOutcome {
    /// The run finished. `text` is the transcript for speech to text, None for text to speech.
    Done {
        text: Option<String>,
    },
    Cancelled,
    /// The message, with the last output lines under it.
    Failed(String),
}

/// The transcript in a speech to text run's stdout, trimmed. None when no transcript line is there.
pub(super) fn parse_transcript(stdout: &str) -> Option<String> {
    let line = stdout
        .lines()
        .map(str::trim_start)
        .find(|line| line.starts_with(TRANSCRIPT_LINE_START))?;
    let json: serde_json::Value = serde_json::from_str(line).ok()?;
    json.get("text")?
        .as_str()
        .map(|text| text.trim().to_string())
}

/// Decide the outcome from what happened. A cancel wins over any exit code, since a killed process
/// reports a failure code. A run that exits cleanly still fails when it left no transcript
/// (speech to text) or no WAV file (every other kind).
pub(super) fn speech_outcome(
    kind: SpeechKind,
    cancelled: bool,
    exit_code: Option<i32>,
    stdout: &str,
    wav_written: bool,
    tail: &[String],
) -> SpeechOutcome {
    if cancelled {
        return SpeechOutcome::Cancelled;
    }
    if exit_code != Some(0) {
        let headline = match exit_code {
            Some(code) => format!("sherpa-onnx exited with code {code}"),
            None => "sherpa-onnx stopped unexpectedly".to_string(),
        };
        return SpeechOutcome::Failed(failure_message(headline, tail));
    }
    match kind {
        SpeechKind::Stt => match parse_transcript(stdout) {
            Some(text) => SpeechOutcome::Done { text: Some(text) },
            None => SpeechOutcome::Failed(failure_message(
                "sherpa-onnx finished without a transcript".to_string(),
                tail,
            )),
        },
        SpeechKind::Tts | SpeechKind::Denoise | SpeechKind::Separate if wav_written => {
            SpeechOutcome::Done { text: None }
        }
        SpeechKind::Tts | SpeechKind::Denoise | SpeechKind::Separate => {
            SpeechOutcome::Failed(failure_message(
                "sherpa-onnx finished without writing a WAV file".to_string(),
                tail,
            ))
        }
    }
}

/// The headline, then the lines that name the problem. Those are the error lines of the tail, or
/// the last two readable lines when none names one.
fn failure_message(headline: String, tail: &[String]) -> String {
    let readable: Vec<&String> = tail
        .iter()
        .filter(|line| !line.trim().is_empty() && line.chars().count() <= MAX_DETAIL_CHARS)
        .collect();
    let named: Vec<&String> = readable
        .iter()
        .copied()
        .filter(|line| names_an_error(line))
        .collect();
    let detail: Vec<&String> = if named.is_empty() {
        readable.iter().rev().take(2).rev().copied().collect()
    } else {
        named
    };
    let first = detail.len().saturating_sub(MAX_DETAIL_LINES);
    let mut lines = vec![headline];
    lines.extend(detail[first..].iter().map(|line| line.to_string()));
    lines.join(
        "
",
    )
}

/// True when a line uses one of the words that mark an error.
fn names_an_error(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("no such file")
        || lower
            .split(|c: char| !c.is_alphanumeric())
            .any(|word| ERROR_WORDS.contains(&word))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The stdout line sherpa-onnx-offline 2.0.1 (Windows ARM64, Whisper tiny.en) printed for the
    /// sample WAV of a Kokoro synthesis.
    const CAPTURED_LINE: &str = r#"{"lang": "", "emotion": "", "event": "", "text": "Hello from running speech synthesis on the Snapdragon Snapdragon.", "timestamps": [], "durations": [], "tokens":[" Hello", " from", " running", " speech", " synthesis", " on", " the", " Snapdragon", " Snapdragon", "."], "ys_log_probs": [], "words": []}"#;

    fn lines(text: &[&str]) -> Vec<String> {
        text.iter().map(|line| line.to_string()).collect()
    }

    #[test]
    fn the_transcript_is_the_text_field_of_the_lang_line() {
        let stdout = format!("{CAPTURED_LINE}\n");
        assert_eq!(
            parse_transcript(&stdout).as_deref(),
            Some("Hello from running speech synthesis on the Snapdragon Snapdragon.")
        );
    }

    #[test]
    fn other_stdout_lines_are_skipped_and_the_text_is_trimmed() {
        let stdout =
            "sample=79844, progress=1.000000\n   {\"lang\": \"\", \"text\": \"  Hi there \"}\r\n";
        assert_eq!(parse_transcript(stdout).as_deref(), Some("Hi there"));
    }

    #[test]
    fn a_missing_or_broken_transcript_line_gives_no_text() {
        assert_eq!(parse_transcript(""), None);
        assert_eq!(parse_transcript("Done!\n"), None);
        assert_eq!(parse_transcript("{\"lang\": \"\", \"text\": "), None);
        assert_eq!(parse_transcript("{\"lang\": \"\"}"), None);
    }

    #[test]
    fn a_cancel_wins_over_the_exit_code() {
        assert_eq!(
            speech_outcome(
                SpeechKind::Stt,
                true,
                Some(1),
                "",
                true,
                &lines(&["killed"])
            ),
            SpeechOutcome::Cancelled
        );
        assert_eq!(
            speech_outcome(SpeechKind::Tts, true, None, "", false, &[]),
            SpeechOutcome::Cancelled
        );
    }

    #[test]
    fn a_transcription_that_exits_cleanly_is_done_with_its_text() {
        let stdout = format!("{CAPTURED_LINE}\n");
        assert_eq!(
            speech_outcome(SpeechKind::Stt, false, Some(0), &stdout, true, &[]),
            SpeechOutcome::Done {
                text: Some(
                    "Hello from running speech synthesis on the Snapdragon Snapdragon.".to_string()
                )
            }
        );
    }

    #[test]
    fn a_clean_exit_without_a_transcript_is_a_failure_with_the_tail() {
        let tail = lines(&["Started", "unexpected end of input"]);
        let SpeechOutcome::Failed(message) =
            speech_outcome(SpeechKind::Stt, false, Some(0), "", true, &tail)
        else {
            panic!("expected a failure");
        };
        assert_eq!(
            message,
            "sherpa-onnx finished without a transcript\nStarted\nunexpected end of input"
        );
    }

    #[test]
    fn a_synthesis_that_exits_cleanly_is_done_when_the_wav_is_there() {
        assert_eq!(
            speech_outcome(SpeechKind::Tts, false, Some(0), "sample=1", true, &[]),
            SpeechOutcome::Done { text: None }
        );
    }

    #[test]
    fn a_synthesis_without_its_wav_is_a_failure() {
        let SpeechOutcome::Failed(message) =
            speech_outcome(SpeechKind::Tts, false, Some(0), "", false, &[])
        else {
            panic!("expected a failure");
        };
        assert!(message.contains("without writing a WAV file"), "{message}");
    }

    #[test]
    fn a_denoise_run_is_done_when_its_wav_is_there_and_its_stdout_is_not_read() {
        let stdout = "Elapsed seconds: 0.13\nSaved to output_16k.wav\n";
        assert_eq!(
            speech_outcome(SpeechKind::Denoise, false, Some(0), stdout, true, &[]),
            SpeechOutcome::Done { text: None }
        );
    }

    #[test]
    fn a_separate_run_is_done_when_its_wavs_are_there() {
        assert_eq!(
            speech_outcome(SpeechKind::Separate, false, Some(0), "", true, &[]),
            SpeechOutcome::Done { text: None }
        );
    }

    #[test]
    fn an_audio_run_that_exits_cleanly_without_its_wavs_is_a_failure() {
        for kind in [SpeechKind::Denoise, SpeechKind::Separate] {
            let SpeechOutcome::Failed(message) =
                speech_outcome(kind, false, Some(0), "", false, &[])
            else {
                panic!("{kind:?} without its WAV should fail");
            };
            assert!(message.contains("without writing a WAV file"), "{message}");
        }
    }

    #[test]
    fn an_audio_run_that_fails_or_is_cancelled_follows_the_same_rules() {
        let tail = lines(&["Failed to read 'in.wav'"]);
        let SpeechOutcome::Failed(message) =
            speech_outcome(SpeechKind::Separate, false, Some(-1), "", true, &tail)
        else {
            panic!("expected a failure");
        };
        assert_eq!(
            message,
            "sherpa-onnx exited with code -1\nFailed to read 'in.wav'"
        );
        assert_eq!(
            speech_outcome(SpeechKind::Denoise, true, None, "", false, &[]),
            SpeechOutcome::Cancelled
        );
    }

    #[test]
    fn a_non_zero_exit_carries_the_code_and_the_error_lines() {
        let tail = lines(&["Failed to load model: no such file"]);
        let SpeechOutcome::Failed(message) =
            speech_outcome(SpeechKind::Stt, false, Some(255), "", true, &tail)
        else {
            panic!("expected a failure");
        };
        assert_eq!(
            message,
            "sherpa-onnx exited with code 255
Failed to load model: no such file"
        );
    }

    #[test]
    fn the_failure_detail_leaves_out_the_config_dump_and_the_command_echo() {
        let config_dump = format!("OfflineRecognizerConfig({})", "x".repeat(400));
        let tail = lines(&[
            r"C:\sherpa-onnx\csrc\parse-options.cc:Read:374 'sherpa-onnx-offline.exe' --whisper-encoder=x",
            &config_dump,
            "Creating recognizer ...",
            r"C:\sherpa-onnx\csrc\wave-reader.cc:ReadWaveImpl:77 Expected chunk_id RIFF. Given: 0x73696874",
            "",
            "Failed to read 'garbage.wav'",
        ]);
        let SpeechOutcome::Failed(message) =
            speech_outcome(SpeechKind::Stt, false, Some(-1), "", true, &tail)
        else {
            panic!("expected a failure");
        };
        assert_eq!(
            message,
            concat!(
                "sherpa-onnx exited with code -1
",
                r"C:\sherpa-onnx\csrc\wave-reader.cc:ReadWaveImpl:77 Expected chunk_id RIFF. Given: 0x73696874",
                "
",
                "Failed to read 'garbage.wav'"
            )
        );
    }

    #[test]
    fn only_whole_error_words_name_an_error() {
        assert!(names_an_error("Expected chunk_id RIFF"));
        assert!(names_an_error("Failed to read file"));
        assert!(names_an_error("error: bad header"));
        assert!(names_an_error("No such file or directory"));
        assert!(
            !names_an_error("unexpected end of input"),
            "unexpected is not expected"
        );
        assert!(!names_an_error("Started"));
    }

    #[test]
    fn without_an_error_line_the_last_two_readable_lines_are_shown() {
        let tail = lines(&[
            "Creating recognizer ...",
            "recognizer created in 0.4 s",
            "Started",
        ]);
        let SpeechOutcome::Failed(message) =
            speech_outcome(SpeechKind::Tts, false, Some(3), "", false, &tail)
        else {
            panic!("expected a failure");
        };
        assert_eq!(
            message,
            "sherpa-onnx exited with code 3
recognizer created in 0.4 s
Started"
        );
    }

    #[test]
    fn an_unknown_exit_status_is_a_failure() {
        let SpeechOutcome::Failed(message) =
            speech_outcome(SpeechKind::Tts, false, None, "", false, &[])
        else {
            panic!("expected a failure");
        };
        assert_eq!(message, "sherpa-onnx stopped unexpectedly");
    }
}
