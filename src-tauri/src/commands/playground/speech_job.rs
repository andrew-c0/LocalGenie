//! Runs one speech job with sherpa-onnx: starts the program, reports its phases to the webview, and
//! says how it ended. One speech job runs at a time. The active job lives in managed state, so it
//! can be cancelled, or killed when the window closes.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncReadExt;
use tokio::process::{Child, ChildStdout};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use super::program;
use super::progress::{forward_lines, plain_text, OutputTail};
use super::speech_catalog::SpeechKind;
use super::speech_output::{speech_outcome, SpeechOutcome};
use super::wav;
use crate::commands::server::{kill_process, kill_process_sync};

const SPEECH_PROGRESS_EVENT: &str = "playground-speech-progress";
const SPEECH_DONE_EVENT: &str = "playground-speech-done";
/// The line the recogniser prints on stderr once its model is loaded and it starts decoding.
const RECOGNISER_STARTED_LINE: &str = "Started";

/// Stages of a speech job, in the order they run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum SpeechPhase {
    /// Reading the model files.
    Loading,
    /// Recognising or synthesising.
    Running,
    /// Reading the result back.
    Saving,
}

/// How a speech job ended, as the webview sees it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum SpeechStatus {
    Ok,
    Cancelled,
    Error,
}

/// `playground-speech-progress`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SpeechProgressEvent {
    pub job_id: String,
    pub phase: SpeechPhase,
}

/// One WAV an audio to audio job writes, with the label the webview shows for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AudioOutput {
    pub label: &'static str,
    pub path: PathBuf,
}

/// An `AudioOutput` as the webview sees it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(super) struct AudioOutputEvent {
    pub label: &'static str,
    pub path: String,
}

/// `playground-speech-done`. `text` is set for speech to text, `output_path` for text to speech,
/// `outputs` for speech denoising and source separation; `error` when the status is `error`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SpeechDoneEvent {
    pub job_id: String,
    pub kind: SpeechKind,
    pub status: SpeechStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outputs: Option<Vec<AudioOutputEvent>>,
    /// Length of the audio: the recording for speech to text, the saved speech for text to speech,
    /// the input for an audio to audio job.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub audio_seconds: Option<f64>,
    pub elapsed_seconds: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Everything `SpeechJobs::start` needs to run one job.
#[derive(Debug)]
pub(super) struct SpeechJob {
    pub job_id: String,
    pub kind: SpeechKind,
    /// The sherpa-onnx program to run.
    pub program: PathBuf,
    /// The folder the program runs from: the `bin` folder, where its DLLs are.
    pub folder: PathBuf,
    pub args: Vec<String>,
    /// The WAV whose length is reported: the input for speech to text and audio to audio, the saved
    /// speech for text to speech.
    pub audio: PathBuf,
    /// The WAV files an audio to audio job writes. Empty for speech jobs.
    pub outputs: Vec<AudioOutput>,
}

impl SpeechJob {
    /// True when the job's WAV output is on disk: the speech for text to speech, or every output
    /// for an audio to audio job.
    fn wav_written(&self) -> bool {
        if self.outputs.is_empty() {
            self.audio.is_file()
        } else {
            self.outputs.iter().all(|output| output.path.is_file())
        }
    }
}

/// The job that holds the one speech slot.
#[derive(Debug)]
struct ActiveSpeechJob {
    job_id: String,
    /// None when the process has already been reaped.
    pid: Option<u32>,
    cancel: Arc<AtomicBool>,
}

/// Managed state: the speech job that is running, if any.
#[derive(Default)]
pub struct SpeechJobs {
    active: Mutex<Option<ActiveSpeechJob>>,
}

impl SpeechJobs {
    fn lock(&self) -> Result<MutexGuard<'_, Option<ActiveSpeechJob>>, String> {
        self.active
            .lock()
            .map_err(|_| "speech job state is unavailable".to_string())
    }

    /// Start `job` in the background. Fails when another speech job is running, or sherpa-onnx
    /// cannot start. The slot is held while the program starts, so two requests cannot both get in.
    pub(super) fn start(&self, app: &AppHandle, job: SpeechJob) -> Result<(), String> {
        let mut active = self.lock()?;
        if active.is_some() {
            return Err(
                "A speech job is already running. Wait for it to finish or cancel it.".to_string(),
            );
        }
        let child = spawn_program(&job.program, &job.folder, &job.args)?;
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some(ActiveSpeechJob {
            job_id: job.job_id.clone(),
            pid: child.id(),
            cancel: Arc::clone(&cancel),
        });
        drop(active);
        tokio::spawn(run_job(app.clone(), child, job, cancel));
        Ok(())
    }

    /// Flag the job as cancelled and return the process to kill. None when `job_id` is not the
    /// running job, or the process is already gone.
    pub(super) fn request_cancel(&self, job_id: &str) -> Result<Option<u32>, String> {
        let active = self.lock()?;
        let Some(job) = active.as_ref().filter(|job| job.job_id == job_id) else {
            return Ok(None);
        };
        job.cancel.store(true, Ordering::Relaxed);
        Ok(job.pid)
    }

    /// Kill the running job's process tree from a window-destroy handler, where async is not
    /// available.
    pub fn kill_active_sync(&self) {
        let pid = self
            .lock()
            .ok()
            .and_then(|mut active| active.take())
            .and_then(|job| job.pid);
        if let Some(pid) = pid {
            kill_process_sync(pid);
        }
    }

    /// True while a speech job runs, from the moment its process starts until it is reaped.
    pub(super) fn is_running(&self) -> Result<bool, String> {
        Ok(self.lock()?.is_some())
    }

    /// Free the slot once `job_id` has finished. Any other job is left alone.
    fn forget(&self, job_id: &str) {
        if let Ok(mut active) = self.lock() {
            if active.as_ref().is_some_and(|job| job.job_id == job_id) {
                *active = None;
            }
        }
    }
}

/// Stop the running speech job's process tree. The job's own task then reports it as cancelled.
pub(super) async fn cancel_job(jobs: &SpeechJobs, job_id: &str) -> Result<(), String> {
    if let Some(pid) = jobs.request_cancel(job_id)? {
        kill_process(pid).await;
    }
    Ok(())
}

/// Start a sherpa-onnx program from `folder` with piped output.
fn spawn_program(program: &Path, folder: &Path, args: &[String]) -> Result<Child, String> {
    let mut command = program::command(program, folder);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
        .spawn()
        .map_err(|e| format!("Failed to start sherpa-onnx: {e}"))
}

/// The phase a job starts in. The recogniser prints `Started` once its model is loaded, so it starts
/// in `loading`. The synthesiser and the audio programs print nothing before they work, so they
/// start in `running`.
fn starting_phase(kind: SpeechKind) -> SpeechPhase {
    match kind {
        SpeechKind::Stt => SpeechPhase::Loading,
        SpeechKind::Tts | SpeechKind::Denoise | SpeechKind::Separate => SpeechPhase::Running,
    }
}

/// Watch one job until the program exits, then free the slot and report the outcome.
async fn run_job(app: AppHandle, mut child: Child, job: SpeechJob, cancel: Arc<AtomicBool>) {
    let started = Instant::now();
    // The transcript is read in full on its own task, so stdout cannot fill up while stderr is read.
    let stdout_task = child.stdout.take().map(read_stdout);
    let (lines_tx, mut lines_rx) = mpsc::unbounded_channel();
    if let Some(stderr) = child.stderr.take() {
        forward_lines(stderr, lines_tx);
    }

    let mut phase = starting_phase(job.kind);
    emit_progress(&app, &job.job_id, phase);
    let mut tail = OutputTail::default();
    while let Some(line) = lines_rx.recv().await {
        if phase == SpeechPhase::Loading && line.trim() == RECOGNISER_STARTED_LINE {
            phase = SpeechPhase::Running;
            emit_progress(&app, &job.job_id, phase);
        }
        tail.push(plain_text(&line));
    }

    let exit_code = child.wait().await.ok().and_then(|status| status.code());
    let stdout = match stdout_task {
        Some(task) => task.await.unwrap_or_default(),
        None => String::new(),
    };
    emit_progress(&app, &job.job_id, SpeechPhase::Saving);
    app.state::<SpeechJobs>().forget(&job.job_id);

    let outcome = speech_outcome(
        job.kind,
        cancel.load(Ordering::Relaxed),
        exit_code,
        &stdout,
        job.wav_written(),
        &tail.to_vec(),
    );
    let audio_seconds = match outcome {
        SpeechOutcome::Done { .. } => wav::duration_seconds(&job.audio).ok(),
        _ => None,
    };
    let event = done_event(
        &job,
        outcome,
        audio_seconds,
        started.elapsed().as_secs_f64(),
    );
    let _ = app.emit(SPEECH_DONE_EVENT, &event);
}

/// Read a child's stdout to the end on a task of its own. The text is lossy UTF-8.
fn read_stdout(mut stdout: ChildStdout) -> JoinHandle<String> {
    tokio::spawn(async move {
        let mut bytes = Vec::new();
        let _ = stdout.read_to_end(&mut bytes).await;
        String::from_utf8_lossy(&bytes).into_owned()
    })
}

/// The `playground-speech-done` event for a job that ended with `outcome`.
fn done_event(
    job: &SpeechJob,
    outcome: SpeechOutcome,
    audio_seconds: Option<f64>,
    elapsed_seconds: f64,
) -> SpeechDoneEvent {
    let mut event = SpeechDoneEvent {
        job_id: job.job_id.clone(),
        kind: job.kind,
        status: SpeechStatus::Error,
        text: None,
        output_path: None,
        outputs: None,
        audio_seconds: None,
        elapsed_seconds,
        error: None,
    };
    match outcome {
        SpeechOutcome::Done { text } => {
            event.status = SpeechStatus::Ok;
            event.text = text;
            event.output_path = match job.kind {
                SpeechKind::Tts => Some(job.audio.to_string_lossy().into_owned()),
                SpeechKind::Stt | SpeechKind::Denoise | SpeechKind::Separate => None,
            };
            event.outputs = (!job.outputs.is_empty()).then(|| {
                job.outputs
                    .iter()
                    .map(|output| AudioOutputEvent {
                        label: output.label,
                        path: output.path.to_string_lossy().into_owned(),
                    })
                    .collect()
            });
            event.audio_seconds = audio_seconds;
        }
        SpeechOutcome::Cancelled => event.status = SpeechStatus::Cancelled,
        SpeechOutcome::Failed(message) => event.error = Some(message),
    }
    event
}

fn emit_progress(app: &AppHandle, job_id: &str, phase: SpeechPhase) {
    let _ = app.emit(
        SPEECH_PROGRESS_EVENT,
        &SpeechProgressEvent {
            job_id: job_id.to_string(),
            phase,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(kind: SpeechKind, audio: &str) -> SpeechJob {
        SpeechJob {
            job_id: "job-1".to_string(),
            kind,
            program: PathBuf::from("sherpa-onnx-offline.exe"),
            folder: PathBuf::from("bin"),
            args: Vec::new(),
            audio: PathBuf::from(audio),
            outputs: Vec::new(),
        }
    }

    /// An audio to audio job whose outputs are `paths`, labelled as the program's outputs are.
    fn enhance_job(kind: SpeechKind, input: &str, paths: &[&str]) -> SpeechJob {
        let labels: &[&'static str] = match kind {
            SpeechKind::Separate => &["Voice", "Music and other sounds"],
            _ => &["Cleaned speech"],
        };
        SpeechJob {
            outputs: labels
                .iter()
                .zip(paths)
                .map(|(label, path)| AudioOutput {
                    label,
                    path: PathBuf::from(path),
                })
                .collect(),
            ..job(kind, input)
        }
    }

    #[test]
    fn a_recogniser_starts_loading_and_the_others_start_running() {
        assert_eq!(starting_phase(SpeechKind::Stt), SpeechPhase::Loading);
        assert_eq!(starting_phase(SpeechKind::Tts), SpeechPhase::Running);
        assert_eq!(starting_phase(SpeechKind::Denoise), SpeechPhase::Running);
        assert_eq!(starting_phase(SpeechKind::Separate), SpeechPhase::Running);
    }

    #[test]
    fn a_done_enhancement_lists_its_outputs_with_labels_and_no_output_path() {
        let event = done_event(
            &enhance_job(SpeechKind::Separate, "in.wav", &["voice.wav", "music.wav"]),
            SpeechOutcome::Done { text: None },
            Some(10.9),
            0.4,
        );
        assert_eq!(event.status, SpeechStatus::Ok);
        assert_eq!(event.output_path, None);
        assert_eq!(event.text, None);
        assert_eq!(event.audio_seconds, Some(10.9));
        assert_eq!(
            event.outputs,
            Some(vec![
                AudioOutputEvent {
                    label: "Voice",
                    path: "voice.wav".to_string(),
                },
                AudioOutputEvent {
                    label: "Music and other sounds",
                    path: "music.wav".to_string(),
                },
            ])
        );
    }

    #[test]
    fn a_denoise_done_event_has_one_labelled_output() {
        let event = done_event(
            &enhance_job(SpeechKind::Denoise, "in.wav", &["clean.wav"]),
            SpeechOutcome::Done { text: None },
            Some(2.4),
            0.13,
        );
        let json = serde_json::to_value(&event).expect("json");
        assert_eq!(json["kind"], "denoise");
        assert_eq!(json["status"], "ok");
        assert_eq!(json["outputs"][0]["label"], "Cleaned speech");
        assert_eq!(json["outputs"][0]["path"], "clean.wav");
        assert!(
            json.get("outputPath").is_none(),
            "outputPath is for tts only"
        );
        assert_eq!(json["audioSeconds"], 2.4);
    }

    #[test]
    fn a_speech_done_event_has_no_outputs_field() {
        let event = done_event(
            &job(SpeechKind::Tts, "out.wav"),
            SpeechOutcome::Done { text: None },
            Some(1.0),
            0.5,
        );
        let json = serde_json::to_value(&event).expect("json");
        assert!(json.get("outputs").is_none());
        assert_eq!(json["outputPath"], "out.wav");
    }

    #[test]
    fn an_enhancement_is_written_only_when_every_output_is_on_disk() {
        let scratch = crate::commands::playground::test_support::Scratch::new("speech-written");
        let voice = scratch.path().join("voice.wav");
        let music = scratch.path().join("music.wav");
        let job = enhance_job(
            SpeechKind::Separate,
            "in.wav",
            &[&voice.to_string_lossy(), &music.to_string_lossy()],
        );
        assert!(!job.wav_written());
        std::fs::write(&voice, b"RIFF").expect("voice");
        assert!(!job.wav_written(), "one of two is not enough");
        std::fs::write(&music, b"RIFF").expect("music");
        assert!(job.wav_written());
    }

    #[test]
    fn a_speech_job_is_written_when_its_own_wav_is_there() {
        let scratch = crate::commands::playground::test_support::Scratch::new("speech-own-wav");
        let wav = scratch.path().join("speech.wav");
        let job = job(SpeechKind::Tts, &wav.to_string_lossy());
        assert!(!job.wav_written());
        std::fs::write(&wav, b"RIFF").expect("wav");
        assert!(job.wav_written());
    }

    #[test]
    fn a_done_transcription_carries_the_text_and_no_path() {
        let event = done_event(
            &job(SpeechKind::Stt, "clip.wav"),
            SpeechOutcome::Done {
                text: Some("hello".to_string()),
            },
            Some(3.5),
            0.25,
        );
        assert_eq!(event.status, SpeechStatus::Ok);
        assert_eq!(event.text.as_deref(), Some("hello"));
        assert_eq!(event.output_path, None);
        assert_eq!(event.audio_seconds, Some(3.5));
        assert_eq!(event.error, None);
    }

    #[test]
    fn a_done_synthesis_carries_the_saved_path_and_no_text() {
        let event = done_event(
            &job(SpeechKind::Tts, "Music/LocalGenie/speech-hi-1.wav"),
            SpeechOutcome::Done { text: None },
            Some(1.2),
            0.9,
        );
        assert_eq!(event.status, SpeechStatus::Ok);
        assert_eq!(event.text, None);
        assert_eq!(
            event.output_path.as_deref(),
            Some("Music/LocalGenie/speech-hi-1.wav")
        );
    }

    #[test]
    fn a_cancelled_or_failed_job_has_no_result_and_a_failure_has_the_message() {
        let cancelled = done_event(
            &job(SpeechKind::Stt, "clip.wav"),
            SpeechOutcome::Cancelled,
            None,
            2.0,
        );
        assert_eq!(cancelled.status, SpeechStatus::Cancelled);
        assert_eq!(cancelled.error, None);

        let failed = done_event(
            &job(SpeechKind::Tts, "out.wav"),
            SpeechOutcome::Failed("boom".to_string()),
            None,
            0.1,
        );
        assert_eq!(failed.status, SpeechStatus::Error);
        assert_eq!(failed.error.as_deref(), Some("boom"));
        assert_eq!(failed.output_path, None);
    }

    #[test]
    fn the_done_event_json_uses_the_frontend_names_and_omits_absent_fields() {
        let cancelled = done_event(
            &job(SpeechKind::Stt, "clip.wav"),
            SpeechOutcome::Cancelled,
            None,
            2.0,
        );
        let json = serde_json::to_value(&cancelled).expect("json");
        assert_eq!(json["jobId"], "job-1");
        assert_eq!(json["kind"], "stt");
        assert_eq!(json["status"], "cancelled");
        assert_eq!(json["elapsedSeconds"], 2.0);
        for absent in ["text", "outputPath", "audioSeconds", "error"] {
            assert!(json.get(absent).is_none(), "{absent} should be left out");
        }

        let ok = done_event(
            &job(SpeechKind::Tts, "out.wav"),
            SpeechOutcome::Done { text: None },
            Some(4.0),
            1.0,
        );
        let json = serde_json::to_value(&ok).expect("json");
        assert_eq!(json["kind"], "tts");
        assert_eq!(json["status"], "ok");
        assert_eq!(json["outputPath"], "out.wav");
        assert_eq!(json["audioSeconds"], 4.0);
    }

    #[test]
    fn progress_events_use_the_frontend_phase_words() {
        let json = serde_json::to_value(SpeechProgressEvent {
            job_id: "job-2".to_string(),
            phase: SpeechPhase::Saving,
        })
        .expect("json");
        assert_eq!(json["jobId"], "job-2");
        assert_eq!(json["phase"], "saving");
        assert_eq!(serde_json::json!(SpeechPhase::Loading), "loading");
        assert_eq!(serde_json::json!(SpeechPhase::Running), "running");
        assert_eq!(serde_json::json!(SpeechStatus::Ok), "ok");
    }

    #[test]
    fn only_the_running_job_can_be_cancelled() {
        let jobs = SpeechJobs::default();
        assert_eq!(jobs.request_cancel("job-1"), Ok(None));

        let cancel = Arc::new(AtomicBool::new(false));
        *jobs.lock().expect("lock") = Some(ActiveSpeechJob {
            job_id: "job-1".to_string(),
            pid: Some(4242),
            cancel: Arc::clone(&cancel),
        });

        assert_eq!(jobs.request_cancel("job-2"), Ok(None));
        assert!(!cancel.load(Ordering::Relaxed));
        assert_eq!(jobs.is_running(), Ok(true));

        assert_eq!(jobs.request_cancel("job-1"), Ok(Some(4242)));
        assert!(cancel.load(Ordering::Relaxed));

        jobs.forget("job-2");
        assert_eq!(jobs.is_running(), Ok(true));
        jobs.forget("job-1");
        assert_eq!(jobs.is_running(), Ok(false));
    }
}
