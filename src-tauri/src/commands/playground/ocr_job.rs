//! Runs one OCR job: sends the picture to the GenieX server as a chat completion and reports the
//! text. One OCR job runs at a time. The active job lives in managed state so it can be cancelled.
//! A cancel drops the request, which closes the connection; the server may keep generating until it
//! notices.

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

use super::input_image;
use super::ocr_catalog::{OcrMode, OcrRecipe};
use super::ocr_request::{self, BodyParts, Compute, VisionCompute};
use super::JobStatus;

const OCR_DONE_EVENT: &str = "playground-ocr-done";
/// How long one request may take. A page on the CPU takes about a minute.
const OCR_TIMEOUT: Duration = Duration::from_secs(10 * 60);

/// `playground-ocr-done`. `text` is set when the status is `done`, `error` when it is `error`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct OcrDoneEvent {
    pub job_id: String,
    pub status: JobStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub seconds: f64,
}

/// Everything `OcrJobs::start` needs to run one job.
pub(super) struct OcrJob {
    pub job_id: String,
    pub base_url: String,
    pub recipe: &'static OcrRecipe,
    pub mode: OcrMode,
    pub prompt: &'static str,
    /// The checked picture.
    pub image: input_image::InputImage,
    pub compute: Compute,
    pub vision_compute: VisionCompute,
}

/// The job that holds the one OCR slot.
struct ActiveOcrJob {
    job_id: String,
    /// Sends the cancel to the job's task. None once it has been sent.
    cancel: Option<oneshot::Sender<()>>,
}

/// Managed state: the OCR job that is running, if any.
#[derive(Default)]
pub struct OcrJobs {
    active: Mutex<Option<ActiveOcrJob>>,
}

impl OcrJobs {
    fn lock(&self) -> Result<MutexGuard<'_, Option<ActiveOcrJob>>, String> {
        self.active
            .lock()
            .map_err(|_| "OCR job state is unavailable".to_string())
    }

    /// Start `job` in the background. Fails when another OCR job is running.
    pub(super) fn start(
        &self,
        app: &AppHandle,
        client: &reqwest::Client,
        job: OcrJob,
    ) -> Result<(), String> {
        let mut active = self.lock()?;
        if active.is_some() {
            return Err(
                "An OCR job is already running. Wait for it to finish or cancel it.".to_string(),
            );
        }
        let (cancel, cancelled) = oneshot::channel();
        *active = Some(ActiveOcrJob {
            job_id: job.job_id.clone(),
            cancel: Some(cancel),
        });
        drop(active);
        tokio::spawn(run_job(app.clone(), client.clone(), job, cancelled));
        Ok(())
    }

    /// Cancel the running job when it is `job_id`. Any other id is ignored.
    pub(super) fn request_cancel(&self, job_id: &str) -> Result<(), String> {
        let mut active = self.lock()?;
        let sender = active
            .as_mut()
            .filter(|job| job.job_id == job_id)
            .and_then(|job| job.cancel.take());
        if let Some(sender) = sender {
            let _ = sender.send(());
        }
        Ok(())
    }

    /// True while an OCR job runs.
    pub(super) fn is_running(&self) -> Result<bool, String> {
        Ok(self.lock()?.is_some())
    }

    /// Free the slot once `job_id` has finished.
    fn forget(&self, job_id: &str) {
        if let Ok(mut active) = self.lock() {
            if active.as_ref().is_some_and(|job| job.job_id == job_id) {
                *active = None;
            }
        }
    }
}

/// How a request ended, before it is turned into an event.
enum Outcome {
    Text(String),
    Cancelled,
    Failed(String),
}

async fn run_job(
    app: AppHandle,
    client: reqwest::Client,
    job: OcrJob,
    cancelled: oneshot::Receiver<()>,
) {
    let started = Instant::now();
    let outcome = tokio::select! {
        outcome = request_text(&client, &job) => outcome,
        // A dropped sender (never sent) leaves the request running.
        Ok(()) = cancelled => Outcome::Cancelled,
    };
    app.state::<OcrJobs>().forget(&job.job_id);
    let event = done_event(&job.job_id, outcome, started.elapsed().as_secs_f64());
    let _ = app.emit(OCR_DONE_EVENT, &event);
}

/// Send the picture and read the text out of the reply.
async fn request_text(client: &reqwest::Client, job: &OcrJob) -> Outcome {
    match send_request(client, job).await {
        Ok(reply) => Outcome::Text(ocr_request::finish_text(job.mode, &reply)),
        Err(message) => Outcome::Failed(message),
    }
}

async fn send_request(client: &reqwest::Client, job: &OcrJob) -> Result<String, String> {
    let bytes = tokio::fs::read(&job.image.path)
        .await
        .map_err(|e| format!("Cannot read {}: {e}", job.image.path.display()))?;
    let image_url = input_image::data_url(job.image.mime, &bytes);
    drop(bytes);
    let body = ocr_request::build_body(BodyParts {
        model: job.recipe.repo,
        prompt: job.prompt,
        image_url: &image_url,
        compute: job.compute,
        vision_compute: job.vision_compute,
    });
    let url = format!("{}/v1/chat/completions", job.base_url);
    let response = client
        .post(&url)
        .timeout(OCR_TIMEOUT)
        .json(&body)
        .send()
        .await
        .map_err(|e| request_error(&e))?;
    let status = response.status();
    let reply: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("The server sent an unreadable reply: {e}"))?;
    match ocr_request::reply_text(&reply) {
        Ok(text) if status.is_success() => Ok(text),
        Ok(_) => Err(format!("The server answered {status}.")),
        Err(message) => Err(message),
    }
}

fn request_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "The model took more than 10 minutes. Try a smaller picture or the NPU.".to_string()
    } else {
        format!("Could not reach the GenieX server: {error}")
    }
}

fn done_event(job_id: &str, outcome: Outcome, seconds: f64) -> OcrDoneEvent {
    let (status, text, error) = match outcome {
        Outcome::Text(text) => (JobStatus::Done, Some(text), None),
        Outcome::Cancelled => (JobStatus::Cancelled, None, None),
        Outcome::Failed(message) => (JobStatus::Error, None, Some(message)),
    };
    OcrDoneEvent {
        job_id: job_id.to_string(),
        status,
        text,
        error,
        seconds,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_finished_job_reports_its_text() {
        let event = done_event("job-1", Outcome::Text("hello".into()), 1.5);
        let json = serde_json::to_value(&event).expect("json");
        assert_eq!(json["jobId"], "job-1");
        assert_eq!(json["status"], "done");
        assert_eq!(json["text"], "hello");
        assert_eq!(json["seconds"], 1.5);
        assert!(json.get("error").is_none());
    }

    #[test]
    fn a_failed_job_reports_its_error_and_a_cancelled_one_nothing_else() {
        let failed = serde_json::to_value(done_event("j", Outcome::Failed("boom".into()), 0.0))
            .expect("json");
        assert_eq!(failed["status"], "error");
        assert_eq!(failed["error"], "boom");
        assert!(failed.get("text").is_none());

        let cancelled =
            serde_json::to_value(done_event("j", Outcome::Cancelled, 2.0)).expect("json");
        assert_eq!(cancelled["status"], "cancelled");
        assert!(cancelled.get("text").is_none() && cancelled.get("error").is_none());
    }

    #[test]
    fn only_the_running_job_can_be_cancelled_and_one_job_holds_the_slot() {
        let jobs = OcrJobs::default();
        let (cancel, mut cancelled) = oneshot::channel();
        *jobs.lock().expect("lock") = Some(ActiveOcrJob {
            job_id: "job-1".into(),
            cancel: Some(cancel),
        });
        assert!(jobs.is_running().expect("running"));

        jobs.request_cancel("other").expect("ignored");
        assert!(cancelled.try_recv().is_err(), "another job id is ignored");
        jobs.request_cancel("job-1").expect("cancel");
        assert_eq!(cancelled.try_recv(), Ok(()));

        jobs.forget("other");
        assert!(jobs.is_running().expect("running"));
        jobs.forget("job-1");
        assert!(!jobs.is_running().expect("running"));
    }
}
