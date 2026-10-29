//! The Playground: text-to-image (stable-diffusion.cpp image jobs) and speech (sherpa-onnx speech to
//! text and text to speech jobs). Image models live in `<app data>/playground-models/`; speech models
//! in `<app data>/playground-models/k2-fsa--sherpa-onnx/`. Images are saved in `<Pictures>/LocalGenie/`,
//! speech in `<Music>/LocalGenie/`. Images from before that were saved in `<app data>/playground/images/`
//! and still open. Only catalogue URLs are fetched; the webview picks a model by id and never
//! supplies a URL.

mod args;
mod catalog;
mod devices;
mod image_job;
mod model_delete;
mod model_download;
mod paths;
mod program;
mod progress;
mod recordings;
mod speech_args;
mod speech_catalog;
pub(crate) mod speech_commands;
mod speech_delete;
mod speech_download;
mod speech_job;
mod speech_output;
mod wav;

use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD, Engine};
use sea_orm::DatabaseConnection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::attachments;
use super::download::DownloadRegistry;
use super::runtimes;
use args::ImageRequest;
use catalog::ImageModel;
use devices::SdDevice;
use image_job::ImageJob;
pub use image_job::PlaygroundJobs;
use model_delete::ModelDeletion;
pub use speech_job::SpeechJobs;

/// Largest image `playground_read_image` returns, in bytes.
const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const NOT_INSTALLED: &str = "stable-diffusion.cpp is not installed";

/// How a model download or image job ended, as the webview sees it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum JobStatus {
    Done,
    Error,
    Cancelled,
}

/// The curated text-to-image models, with the state of their files.
#[tauri::command]
pub fn playground_image_models(app: AppHandle) -> Result<Vec<ImageModel>, String> {
    let models_root = paths::models_root(&app_data_dir(&app)?);
    Ok(catalog::RECIPES
        .iter()
        .map(|recipe| catalog::describe(recipe, &models_root))
        .collect())
}

/// Download the files of a curated model that are not on disk yet. Progress arrives as
/// `playground-download-progress` and the end as `playground-download-done`. Cancel with
/// `cancel_download("playground:<model id>")`. Resolves when the run ends; an error rejects too.
#[tauri::command]
pub async fn playground_download_model(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    model_id: String,
) -> Result<(), String> {
    let recipe = catalog::find_recipe(&model_id)?;
    let models_root = paths::models_root(&app_data_dir(&app)?);
    let download_id = model_download::download_id(recipe.id);
    let cancel = registry.register(&download_id)?;
    let outcome = model_download::RecipeDownload {
        app: &app,
        client: registry.client(),
        models_root: &models_root,
        cancel: &cancel,
    }
    .run(recipe)
    .await;
    registry.release(&download_id);
    model_download::report_outcome(&app, recipe.id, outcome)
}

/// The compute devices sd-cli lists on this computer, for the device picker. Fails when the
/// runtime is not installed.
#[tauri::command]
pub async fn playground_list_devices(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<SdDevice>, String> {
    let program = installed_program(&db).await?;
    devices::list_devices(&program).await
}

/// Delete a curated model's files, keeping any file another downloaded model still needs. Refused
/// while the model is downloading or an image is being made. Returns the bytes freed.
#[tauri::command]
pub async fn playground_delete_model(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    jobs: State<'_, PlaygroundJobs>,
    model_id: String,
) -> Result<ModelDeletion, String> {
    let recipe = catalog::find_recipe(&model_id)?;
    let models_root = paths::models_root(&app_data_dir(&app)?);
    if jobs.is_running()? {
        return Err(
            "An image is being made. Wait for it to finish, then delete the model.".to_string(),
        );
    }
    // Registering the download id refuses a download of this model until the delete ends.
    let download_id = model_download::download_id(recipe.id);
    registry.register(&download_id).map_err(|_| {
        format!(
            "{} is downloading. Cancel the download before deleting it.",
            recipe.name
        )
    })?;
    let outcome = model_delete::delete_model_files(&models_root, recipe).await;
    registry.release(&download_id);
    outcome
}

/// Start one image in the background and return. Progress arrives as `playground-image-progress`
/// and the end as `playground-image-done`. Fails at once when the model is not downloaded, the
/// runtime is not installed, or another image is being made. First the devices sd-cli lists are
/// read, which takes a moment: a chosen device must be one of them, and a missing or `auto` device
/// runs on the CPU.
#[tauri::command]
pub async fn playground_generate_image(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    jobs: State<'_, PlaygroundJobs>,
    request: ImageRequest,
) -> Result<(), String> {
    paths::validate_job_id(&request.job_id)?;
    args::validate_request(&request)?;
    let recipe = catalog::find_recipe(&request.model_id)?;
    let data_dir = app_data_dir(&app)?;
    let models_root = paths::models_root(&data_dir);
    if !catalog::is_downloaded(recipe, &models_root) {
        return Err(format!(
            "{} is not downloaded yet. Download it first.",
            recipe.name
        ));
    }
    let program = installed_program(&db).await?;
    let backend = devices::resolve_backend(&program, request.device.as_deref()).await?;

    let request = request.with_resolved_seed();
    let output_folder = paths::output_folder(&pictures_dir(&app)?);
    tokio::fs::create_dir_all(&output_folder)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", output_folder.display()))?;
    let stem = paths::image_stem(&request.prompt, &file_timestamp(), request.seed);
    let output = paths::free_output_path(&output_folder, &stem)?;
    let args = args::build_args(
        recipe,
        &recipe.local_paths(&models_root),
        &request,
        &output,
        backend.as_deref(),
    );
    jobs.start(
        &app,
        ImageJob {
            job_id: request.job_id,
            program,
            args,
            output,
            steps: request.steps,
            seed: request.seed,
        },
    )
}

/// Cancel the running image. Its process tree is killed, and `playground-image-done` then arrives
/// with status `cancelled`. Does nothing when `job_id` is not the running job.
#[tauri::command]
pub async fn playground_cancel_image(
    jobs: State<'_, PlaygroundJobs>,
    job_id: String,
) -> Result<(), String> {
    image_job::cancel_job(&jobs, &job_id).await
}

/// A generated image as a `data:image/png;base64,` URL. The path must be inside an images folder.
#[tauri::command]
pub async fn playground_read_image(app: AppHandle, path: String) -> Result<String, String> {
    let file = paths::resolve_image_path(&path, &image_roots(&app)?)?;
    let size = tokio::fs::metadata(&file)
        .await
        .map_err(|e| format!("Cannot read {path}: {e}"))?
        .len();
    if size > MAX_IMAGE_BYTES {
        return Err(format!(
            "The image is larger than {} MB.",
            MAX_IMAGE_BYTES / (1024 * 1024)
        ));
    }
    let bytes = tokio::fs::read(&file)
        .await
        .map_err(|e| format!("Cannot read {path}: {e}"))?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

/// Select a generated image in its folder in Explorer. The path must be inside an images folder.
#[tauri::command]
pub fn playground_reveal_image(app: AppHandle, path: String) -> Result<(), String> {
    let file = paths::resolve_image_path(&path, &image_roots(&app)?)?;
    attachments::reveal_in_explorer(&paths::without_verbatim_prefix(&file))
}

/// The folders an image may be read from: the Pictures output folder and the older app data folder.
fn image_roots(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    Ok(vec![
        paths::legacy_images_root(&app_data_dir(app)?),
        paths::output_folder(&pictures_dir(app)?),
    ])
}

/// The installed stable-diffusion.cpp program. Fails when the runtime is not installed.
async fn installed_program(db: &DatabaseConnection) -> Result<PathBuf, String> {
    runtimes::current_program(db, &runtimes::SD_CPP)
        .await?
        .filter(|path| path.is_file())
        .ok_or_else(|| NOT_INSTALLED.to_string())
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app data folder unavailable: {e}"))
}

fn pictures_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .picture_dir()
        .map_err(|e| format!("Pictures folder unavailable: {e}"))
}

/// The local time as `yyyyMMdd-HHmmss`, for a file name.
fn file_timestamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::path::{Path, PathBuf};

    /// A fresh folder under the system temp dir, removed when dropped.
    pub(super) struct Scratch(PathBuf);

    impl Scratch {
        pub(super) fn new(name: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir().join(format!(
                "localgenie-playground-{name}-{}-{nanos}",
                std::process::id()
            ));
            std::fs::create_dir_all(&dir).expect("scratch dir");
            Self(dir)
        }

        pub(super) fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    /// Make a file link. False when the platform refuses (Windows needs developer mode or admin).
    pub(super) fn try_file_link(target: &Path, link: &Path) -> bool {
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(target, link);
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_file(target, link);
        made.is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn job_status_uses_the_frontend_words() {
        assert_eq!(serde_json::json!(JobStatus::Done), "done");
        assert_eq!(serde_json::json!(JobStatus::Error), "error");
        assert_eq!(serde_json::json!(JobStatus::Cancelled), "cancelled");
    }
}
