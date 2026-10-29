//! Downloads the files of a curated model that are not on disk yet, one after another, and reports
//! progress to the webview. Each file is written to `<name>.part` and renamed when complete, so an
//! interrupted download resumes on the next attempt.

use std::path::Path;
use std::sync::atomic::AtomicBool;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::catalog::{self, ImageRecipe, ModelFile};
use super::JobStatus;
use crate::commands::download::{
    stream_to_partial, validate_file_name, Transfer, TransferProgress,
};

const MODEL_PROGRESS_EVENT: &str = "playground-download-progress";
const MODEL_DONE_EVENT: &str = "playground-download-done";

/// `playground-download-progress`. `file_index` is the file's position in the recipe, counting from
/// 0, so a skipped file leaves a gap. `total` is 0 when the server does not state a length.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DownloadProgressEvent {
    pub model_id: String,
    pub file_name: String,
    pub file_index: usize,
    pub file_count: usize,
    pub received: u64,
    pub total: u64,
}

/// `playground-download-done`. `error` is set only when the status is `error`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct DownloadDoneEvent {
    pub model_id: String,
    pub status: JobStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// How a download run ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum DownloadEnd {
    Finished,
    Cancelled,
}

/// The id a model's download is registered under. `cancel_download` takes this id.
pub(super) fn download_id(recipe: &ImageRecipe) -> String {
    format!("playground:{}", recipe.id)
}

/// One run of a recipe's downloads: where the files go, and the flag that cancels them.
pub(super) struct RecipeDownload<'a> {
    pub app: &'a AppHandle,
    pub client: &'a reqwest::Client,
    pub models_root: &'a Path,
    pub cancel: &'a AtomicBool,
}

impl RecipeDownload<'_> {
    /// Download every file of `recipe` that is not on disk. Stops at once when cancelled.
    pub(super) async fn run(&self, recipe: &ImageRecipe) -> Result<DownloadEnd, String> {
        for (index, file) in recipe.files.iter().enumerate() {
            if catalog::local_path(self.models_root, file).is_file() {
                continue;
            }
            let position = FilePosition {
                model_id: recipe.id,
                index,
                count: recipe.files.len(),
            };
            if self.fetch_file(position, file).await? == DownloadEnd::Cancelled {
                return Ok(DownloadEnd::Cancelled);
            }
        }
        Ok(DownloadEnd::Finished)
    }

    async fn fetch_file(
        &self,
        position: FilePosition<'_>,
        file: &ModelFile,
    ) -> Result<DownloadEnd, String> {
        let name = file.file_name();
        validate_file_name(name)?;
        let dir = catalog::local_dir(self.models_root, file);
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| format!("Failed to create {}: {e}", dir.display()))?;
        let target = dir.join(name);
        let partial = dir.join(format!("{name}.part"));

        let on_progress = |progress: TransferProgress| {
            emit_progress(
                self.app,
                &DownloadProgressEvent {
                    model_id: position.model_id.to_string(),
                    file_name: name.to_string(),
                    file_index: position.index,
                    file_count: position.count,
                    received: progress.received,
                    total: progress.total.unwrap_or(0),
                },
            );
        };
        let finished = match stream_to_partial(
            self.client,
            &catalog::download_url(file),
            &partial,
            Some(self.cancel),
            on_progress,
        )
        .await?
        {
            Transfer::Cancelled => return Ok(DownloadEnd::Cancelled),
            Transfer::Finished(progress) => progress,
        };

        if finished.received != file.size_bytes {
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(format!(
                "{name} is {} bytes, but the catalogue expects {}. The catalogue may be out of date.",
                finished.received, file.size_bytes
            ));
        }
        tokio::fs::rename(&partial, &target)
            .await
            .map_err(|e| format!("Failed to finish {name}: {e}"))?;
        Ok(DownloadEnd::Finished)
    }
}

/// Where a file sits in its recipe, for the progress events.
#[derive(Clone, Copy)]
struct FilePosition<'a> {
    model_id: &'a str,
    index: usize,
    count: usize,
}

/// Emit the done event for a finished run and return the outcome to the caller. An error is also
/// returned, so the command rejects.
pub(super) fn report_outcome(
    app: &AppHandle,
    model_id: &str,
    outcome: Result<DownloadEnd, String>,
) -> Result<(), String> {
    let (status, error) = match &outcome {
        Ok(DownloadEnd::Finished) => (JobStatus::Done, None),
        Ok(DownloadEnd::Cancelled) => (JobStatus::Cancelled, None),
        Err(message) => (JobStatus::Error, Some(message.clone())),
    };
    let _ = app.emit(
        MODEL_DONE_EVENT,
        &DownloadDoneEvent {
            model_id: model_id.to_string(),
            status,
            error,
        },
    );
    outcome.map(|_| ())
}

fn emit_progress(app: &AppHandle, event: &DownloadProgressEvent) {
    let _ = app.emit(MODEL_PROGRESS_EVENT, event);
}

#[cfg(test)]
mod tests {
    use super::super::catalog::find_recipe;
    use super::*;

    #[test]
    fn download_id_is_the_model_id_under_the_playground_prefix() {
        let recipe = find_recipe("sd15-q4").expect("sd15");
        assert_eq!(download_id(recipe), "playground:sd15-q4");
    }

    #[test]
    fn done_event_omits_the_error_unless_it_failed() {
        let done = DownloadDoneEvent {
            model_id: "sd15-q4".to_string(),
            status: JobStatus::Cancelled,
            error: None,
        };
        let json = serde_json::to_value(&done).expect("json");
        assert_eq!(json["modelId"], "sd15-q4");
        assert_eq!(json["status"], "cancelled");
        assert!(json.get("error").is_none());
    }

    #[test]
    fn progress_event_json_uses_the_frontend_names() {
        let event = DownloadProgressEvent {
            model_id: "flux2-klein-4b-q4".to_string(),
            file_name: "flux-2-klein-4b-Q4_0.gguf".to_string(),
            file_index: 0,
            file_count: 3,
            received: 10,
            total: 0,
        };
        let json = serde_json::to_value(&event).expect("json");
        for key in [
            "modelId",
            "fileName",
            "fileIndex",
            "fileCount",
            "received",
            "total",
        ] {
            assert!(json.get(key).is_some(), "missing {key}");
        }
        assert_eq!(json["total"], 0);
    }
}
