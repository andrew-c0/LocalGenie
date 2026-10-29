//! Runs one stable-diffusion.cpp job: starts sd-cli, streams its progress to the webview, and says
//! how it ended. One job runs at a time. The active job lives in managed state, so it can be
//! cancelled, or killed when the window closes.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Child;
use tokio::sync::mpsc;

use super::progress::{plain_text, ImageProgressEvent, LineSplitter, OutputTail, ProgressTracker};
use super::sd_cli;
use super::JobStatus;
use crate::commands::server::{kill_process, kill_process_sync};

const IMAGE_PROGRESS_EVENT: &str = "playground-image-progress";
const IMAGE_DONE_EVENT: &str = "playground-image-done";
/// Read size for each pipe.
const READ_CHUNK_BYTES: usize = 4096;

/// Everything `start` needs to run one image.
#[derive(Debug)]
pub(super) struct ImageJob {
    pub job_id: String,
    pub program: PathBuf,
    pub args: Vec<String>,
    pub output: PathBuf,
    /// Steps requested. The progress tracker uses it until sd-cli reports its own sampling bar.
    pub steps: u32,
    /// The seed sd-cli is given, already chosen when the request asked for a random one.
    pub seed: i64,
}

/// `playground-image-done`. `path` is set when done, `error` when it failed. `seed` is the seed
/// used, also when the request asked for a random one.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ImageDoneEvent {
    pub job_id: String,
    pub status: JobStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub seed: i64,
    pub seconds: f64,
}

/// The job that holds the one image slot.
#[derive(Debug)]
struct ActiveImageJob {
    job_id: String,
    /// None when the process has already been reaped.
    pid: Option<u32>,
    cancel: Arc<AtomicBool>,
}

/// Managed state: the image job that is running, if any.
#[derive(Default)]
pub struct PlaygroundJobs {
    active: Mutex<Option<ActiveImageJob>>,
}

impl PlaygroundJobs {
    fn lock(&self) -> Result<MutexGuard<'_, Option<ActiveImageJob>>, String> {
        self.active
            .lock()
            .map_err(|_| "image job state is unavailable".to_string())
    }

    /// Start `job` in the background. Fails when another image is being made, or sd-cli cannot
    /// start. The slot is held while sd-cli starts, so two requests cannot both get in.
    pub(super) fn start(&self, app: &AppHandle, job: ImageJob) -> Result<(), String> {
        let mut active = self.lock()?;
        if active.is_some() {
            return Err(
                "An image is already being generated. Wait for it to finish or cancel it."
                    .to_string(),
            );
        }
        let child = spawn_sd_cli(&job.program, &job.args)?;
        let cancel = Arc::new(AtomicBool::new(false));
        *active = Some(ActiveImageJob {
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

    /// True while an image is being made, from the moment its process starts until it is reaped.
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

/// Stop the running image job's process tree. The job's own task then reports it as cancelled.
pub(super) async fn cancel_job(jobs: &PlaygroundJobs, job_id: &str) -> Result<(), String> {
    if let Some(pid) = jobs.request_cancel(job_id)? {
        kill_process(pid).await;
    }
    Ok(())
}

/// Start sd-cli with piped output, from its own folder.
fn spawn_sd_cli(program: &Path, args: &[String]) -> Result<Child, String> {
    let mut command = sd_cli::command(program)?;
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
        .spawn()
        .map_err(|e| format!("Failed to start stable-diffusion.cpp: {e}"))
}

/// Watch one job until sd-cli exits, then free the slot and report the outcome.
async fn run_job(app: AppHandle, mut child: Child, job: ImageJob, cancel: Arc<AtomicBool>) {
    let started = Instant::now();
    let (lines_tx, mut lines_rx) = mpsc::unbounded_channel();
    if let Some(stdout) = child.stdout.take() {
        forward_lines(stdout, lines_tx.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        forward_lines(stderr, lines_tx.clone());
    }
    // The receiver closes once both pipes have closed, which is when sd-cli has exited.
    drop(lines_tx);

    let mut tracker = ProgressTracker::new(&job.job_id, job.steps);
    emit_progress(&app, &tracker.starting());

    let mut tail = OutputTail::default();
    while let Some(line) = lines_rx.recv().await {
        if let Some(event) = tracker.observe(&line) {
            emit_progress(&app, &event);
        }
        tail.push(plain_text(&line));
    }

    let exit_code = child.wait().await.ok().and_then(|status| status.code());
    app.state::<PlaygroundJobs>().forget(&job.job_id);
    let outcome = image_outcome(
        cancel.load(Ordering::Relaxed),
        exit_code,
        job.output.is_file(),
        &tail.to_vec(),
    );
    let event = done_event(&job, outcome, started.elapsed().as_secs_f64());
    let _ = app.emit(IMAGE_DONE_EVENT, &event);
}

/// Send each line of one pipe into `lines`, splitting on `\r` and `\n`.
fn forward_lines<R>(mut reader: R, lines: mpsc::UnboundedSender<String>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut splitter = LineSplitter::default();
        let mut buffer = [0u8; READ_CHUNK_BYTES];
        loop {
            let read = match reader.read(&mut buffer).await {
                Ok(read) if read > 0 => read,
                _ => break,
            };
            for line in splitter.push(&buffer[..read]) {
                if lines.send(line).is_err() {
                    return;
                }
            }
        }
        if let Some(rest) = splitter.finish() {
            let _ = lines.send(rest);
        }
    });
}

/// How a job ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum ImageOutcome {
    Done,
    Cancelled,
    /// The message, with the last output lines under it.
    Failed(String),
}

/// Decide the outcome from what happened. A cancel wins over any exit code, since a killed process
/// reports a failure code.
pub(super) fn image_outcome(
    cancelled: bool,
    exit_code: Option<i32>,
    output_written: bool,
    tail: &[String],
) -> ImageOutcome {
    if cancelled {
        return ImageOutcome::Cancelled;
    }
    let exited_ok = exit_code == Some(0);
    if exited_ok && output_written {
        return ImageOutcome::Done;
    }
    let headline = if exited_ok {
        "stable-diffusion.cpp finished without writing an image".to_string()
    } else {
        match exit_code {
            Some(code) => format!("stable-diffusion.cpp exited with code {code}"),
            None => "stable-diffusion.cpp stopped unexpectedly".to_string(),
        }
    };
    ImageOutcome::Failed(with_tail(headline, tail))
}

/// The headline, then the output lines that came before the failure.
fn with_tail(headline: String, tail: &[String]) -> String {
    if tail.is_empty() {
        headline
    } else {
        format!("{headline}\n{}", tail.join("\n"))
    }
}

fn done_event(job: &ImageJob, outcome: ImageOutcome, seconds: f64) -> ImageDoneEvent {
    let (status, path, error) = match outcome {
        ImageOutcome::Done => (
            JobStatus::Done,
            Some(job.output.to_string_lossy().into_owned()),
            None,
        ),
        ImageOutcome::Cancelled => (JobStatus::Cancelled, None, None),
        ImageOutcome::Failed(message) => (JobStatus::Error, None, Some(message)),
    };
    ImageDoneEvent {
        job_id: job.job_id.clone(),
        status,
        path,
        error,
        seed: job.seed,
        seconds,
    }
}

fn emit_progress(app: &AppHandle, event: &ImageProgressEvent) {
    let _ = app.emit(IMAGE_PROGRESS_EVENT, event);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(text: &[&str]) -> Vec<String> {
        text.iter().map(|line| line.to_string()).collect()
    }

    fn job(output: &str) -> ImageJob {
        ImageJob {
            job_id: "job-1".to_string(),
            program: PathBuf::from("sd-cli.exe"),
            args: Vec::new(),
            output: PathBuf::from(output),
            steps: 4,
            seed: 77,
        }
    }

    #[test]
    fn a_clean_exit_with_an_image_is_done() {
        assert_eq!(image_outcome(false, Some(0), true, &[]), ImageOutcome::Done);
    }

    #[test]
    fn a_cancel_wins_over_the_exit_code() {
        assert_eq!(
            image_outcome(true, Some(1), false, &lines(&["killed"])),
            ImageOutcome::Cancelled
        );
        assert_eq!(
            image_outcome(true, None, true, &[]),
            ImageOutcome::Cancelled
        );
    }

    #[test]
    fn a_failure_carries_the_last_output_lines() {
        let tail = lines(&["ggml_vulkan: no device", "error: model load failed"]);
        let ImageOutcome::Failed(message) = image_outcome(false, Some(1), false, &tail) else {
            panic!("expected a failure");
        };
        assert_eq!(
            message,
            "stable-diffusion.cpp exited with code 1\nggml_vulkan: no device\nerror: model load failed"
        );
    }

    #[test]
    fn exit_zero_without_a_file_is_still_a_failure() {
        let ImageOutcome::Failed(message) = image_outcome(false, Some(0), false, &[]) else {
            panic!("expected a failure");
        };
        assert!(message.contains("without writing an image"), "{message}");
    }

    #[test]
    fn an_unknown_exit_status_is_a_failure() {
        let ImageOutcome::Failed(message) = image_outcome(false, None, false, &[]) else {
            panic!("expected a failure");
        };
        assert!(message.contains("stopped unexpectedly"), "{message}");
    }

    #[test]
    fn done_event_carries_the_path_and_failure_carries_the_error() {
        let done = done_event(&job("out/job-1.png"), ImageOutcome::Done, 1.5);
        assert_eq!(done.status, JobStatus::Done);
        assert_eq!(done.path.as_deref(), Some("out/job-1.png"));
        assert_eq!(done.error, None);
        assert_eq!(done.seed, 77);

        let failed = done_event(
            &job("out/job-1.png"),
            ImageOutcome::Failed("boom".to_string()),
            0.2,
        );
        assert_eq!(failed.status, JobStatus::Error);
        assert_eq!(failed.path, None);
        assert_eq!(failed.error.as_deref(), Some("boom"));
    }

    #[test]
    fn done_event_json_uses_the_frontend_names_and_omits_absent_fields() {
        let cancelled = done_event(&job("out/job-1.png"), ImageOutcome::Cancelled, 3.0);
        let json = serde_json::to_value(&cancelled).expect("json");
        assert_eq!(json["jobId"], "job-1");
        assert_eq!(json["status"], "cancelled");
        assert_eq!(json["seconds"], 3.0);
        assert_eq!(json["seed"], 77);
        assert!(json.get("path").is_none());
        assert!(json.get("error").is_none());
    }

    #[test]
    fn only_the_running_job_can_be_cancelled() {
        let jobs = PlaygroundJobs::default();
        assert_eq!(jobs.request_cancel("job-1"), Ok(None));

        let cancel = Arc::new(AtomicBool::new(false));
        *jobs.lock().expect("lock") = Some(ActiveImageJob {
            job_id: "job-1".to_string(),
            pid: Some(4242),
            cancel: Arc::clone(&cancel),
        });

        assert_eq!(jobs.request_cancel("job-2"), Ok(None));
        assert!(!cancel.load(Ordering::Relaxed));

        assert_eq!(jobs.request_cancel("job-1"), Ok(Some(4242)));
        assert!(cancel.load(Ordering::Relaxed));

        jobs.forget("job-2");
        assert!(jobs.lock().expect("lock").is_some());
        jobs.forget("job-1");
        assert!(jobs.lock().expect("lock").is_none());
    }
}
