//! Microphone recordings: the checks on a clip the webview sends before it is saved, the name it is
//! saved under, and the removal of clips that are more than a day old.

use std::ffi::OsStr;
use std::io::Cursor;
use std::path::Path;
use std::time::{Duration, SystemTime};

use super::speech_args::WAV_EXTENSION;
use super::wav;

/// Largest recording `playground_store_audio` accepts, in bytes.
pub(super) const MAX_RECORDING_BYTES: usize = 200 * 1024 * 1024;
/// Recordings older than this are removed the next time one is saved.
const MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);
const RECORDING_PREFIX: &str = "rec-";

/// Checks a recording before it is saved: WAV only, not empty, no bigger than `max_bytes`, and a
/// readable WAV header.
pub(super) fn validate_recording(
    bytes: &[u8],
    extension: &str,
    max_bytes: usize,
) -> Result<(), String> {
    if extension != WAV_EXTENSION {
        return Err(format!(
            "Only WAV recordings can be saved, not {extension}."
        ));
    }
    if bytes.is_empty() {
        return Err("The recording is empty.".to_string());
    }
    if bytes.len() > max_bytes {
        return Err(format!(
            "The recording is larger than {} MB.",
            max_bytes / (1024 * 1024)
        ));
    }
    wav::read_duration(Cursor::new(bytes), bytes.len() as u64)
        .map(|_| ())
        .map_err(|e| format!("The recording is not a usable WAV file: {e}"))
}

/// The file name stem a recording taken at `timestamp` is saved under, for example `rec-20261029-101112`.
pub(super) fn recording_stem(timestamp: &str) -> String {
    format!("{RECORDING_PREFIX}{timestamp}")
}

/// Removes the recordings in `folder` that are older than `MAX_AGE`. Other files are left alone,
/// and a file that cannot be read or removed is kept for the next call.
pub(super) async fn remove_stale_recordings(folder: &Path) {
    let Ok(mut entries) = tokio::fs::read_dir(folder).await else {
        return;
    };
    let now = SystemTime::now();
    while let Ok(Some(entry)) = entries.next_entry().await {
        if !is_recording_name(&entry.file_name()) {
            continue;
        }
        let Ok(modified) = entry.metadata().await.and_then(|meta| meta.modified()) else {
            continue;
        };
        if is_stale(modified, now) {
            let _ = tokio::fs::remove_file(entry.path()).await;
        }
    }
}

/// True when a file was last changed more than `MAX_AGE` before `now`. A time in the future is not
/// stale.
pub(super) fn is_stale(modified: SystemTime, now: SystemTime) -> bool {
    now.duration_since(modified).is_ok_and(|age| age > MAX_AGE)
}

/// True for a file name a recording is saved under: `rec-` in front, `.wav` behind.
fn is_recording_name(name: &OsStr) -> bool {
    name.to_str()
        .is_some_and(|name| name.starts_with(RECORDING_PREFIX) && name.ends_with(".wav"))
}

#[cfg(test)]
mod tests {
    use std::time::UNIX_EPOCH;

    use super::super::test_support::Scratch;
    use super::*;

    /// A one-second mono 16-bit WAV at 16 kHz.
    fn wav_bytes() -> Vec<u8> {
        let data_len: u32 = 32_000;
        let mut bytes = b"RIFF".to_vec();
        bytes.extend_from_slice(&(36 + data_len).to_le_bytes());
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&16_000u32.to_le_bytes());
        bytes.extend_from_slice(&32_000u32.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes());
        bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_len.to_le_bytes());
        bytes.extend(std::iter::repeat_n(0u8, data_len as usize));
        bytes
    }

    #[test]
    fn a_wav_recording_is_accepted_within_the_cap() {
        assert_eq!(
            validate_recording(&wav_bytes(), "wav", MAX_RECORDING_BYTES),
            Ok(())
        );
    }

    #[test]
    fn only_wav_recordings_are_saved() {
        let error = validate_recording(&wav_bytes(), "mp3", MAX_RECORDING_BYTES).expect_err("mp3");
        assert!(error.contains("mp3"), "{error}");
        assert!(validate_recording(&wav_bytes(), "WAV", MAX_RECORDING_BYTES).is_err());
    }

    #[test]
    fn an_empty_or_oversized_recording_is_refused() {
        assert!(validate_recording(&[], "wav", MAX_RECORDING_BYTES).is_err());
        let bytes = wav_bytes();
        let error = validate_recording(&bytes, "wav", bytes.len() - 1).expect_err("too big");
        assert!(error.contains("larger than"), "{error}");
    }

    #[test]
    fn bytes_that_are_not_a_wav_file_are_refused() {
        let error = validate_recording(b"not audio at all", "wav", MAX_RECORDING_BYTES)
            .expect_err("not a wav");
        assert!(error.contains("not a usable WAV"), "{error}");
    }

    #[test]
    fn a_recording_is_stored_as_rec_then_the_timestamp() {
        assert_eq!(recording_stem("20261029-101112"), "rec-20261029-101112");
    }

    #[test]
    fn only_rec_wav_names_count_as_recordings() {
        assert!(is_recording_name(OsStr::new("rec-20261029-101112.wav")));
        assert!(!is_recording_name(OsStr::new("speech-hi-20261029.wav")));
        assert!(!is_recording_name(OsStr::new("rec-20261029.mp3")));
    }

    #[test]
    fn a_file_older_than_a_day_is_stale_and_a_newer_one_is_not() {
        let now = UNIX_EPOCH + Duration::from_secs(10_000_000);
        assert!(is_stale(now - Duration::from_secs(25 * 3600), now));
        assert!(!is_stale(now - Duration::from_secs(23 * 3600), now));
        assert!(
            !is_stale(now + Duration::from_secs(60), now),
            "a future time"
        );
    }

    #[tokio::test]
    async fn stale_recordings_go_and_other_files_stay() {
        let scratch = Scratch::new("recordings-clean");
        let folder = scratch.path();
        let old = UNIX_EPOCH + Duration::from_secs(1_000_000);
        for name in ["rec-old.wav", "notes.wav"] {
            let path = folder.join(name);
            std::fs::write(&path, b"x").expect("file");
            std::fs::File::options()
                .write(true)
                .open(&path)
                .and_then(|file| file.set_modified(old))
                .expect("mtime");
        }
        let fresh = folder.join("rec-fresh.wav");
        std::fs::write(&fresh, b"x").expect("fresh");

        remove_stale_recordings(folder).await;

        assert!(
            !folder.join("rec-old.wav").exists(),
            "old recording is removed"
        );
        assert!(folder.join("notes.wav").exists(), "other files are kept");
        assert!(fresh.exists(), "a new recording is kept");
    }

    #[tokio::test]
    async fn cleaning_a_folder_that_does_not_exist_does_nothing() {
        let scratch = Scratch::new("recordings-missing");
        remove_stale_recordings(&scratch.path().join("absent")).await;
    }
}
