//! The Playground's image upscaling commands: the model list, model download and delete, and the
//! upscaling job. A job runs through the image job slot and reports on the image events, so it
//! shares cancel (`playground_cancel_image`) and the one-image-at-a-time rule with generation.

use sea_orm::DatabaseConnection;
use tauri::{AppHandle, State};

use super::image_job::{ImageJob, PlaygroundJobs};
use super::model_delete::ModelDeletion;
use super::model_download;
use super::paths;
use super::upscale_args::{self, UpscaleRequest};
use super::upscale_catalog::{self, UpscaleModel};
use super::upscale_files;
use super::{app_data_dir, devices, file_timestamp, input_image, installed_program, pictures_dir};
use crate::commands::download::DownloadRegistry;

/// The curated upscaling models, with the state of their files.
#[tauri::command]
pub fn playground_upscale_models(app: AppHandle) -> Result<Vec<UpscaleModel>, String> {
    let models_root = paths::models_root(&app_data_dir(&app)?);
    Ok(upscale_catalog::RECIPES
        .iter()
        .map(|recipe| upscale_catalog::describe(recipe, &models_root))
        .collect())
}

/// Download an upscaler's file. Progress arrives as `playground-download-progress` and the end as
/// `playground-download-done`. Cancel with `cancel_download("playground:<model id>")`. Resolves when
/// the run ends; an error rejects too.
#[tauri::command]
pub async fn playground_download_upscale_model(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    model_id: String,
) -> Result<(), String> {
    let recipe = upscale_catalog::find_recipe(&model_id)?;
    let models_root = paths::models_root(&app_data_dir(&app)?);
    let download_id = model_download::download_id(recipe.id);
    let cancel = registry.register(&download_id)?;
    let outcome = upscale_files::download_upscale_model(
        &app,
        registry.client(),
        &models_root,
        recipe,
        &cancel,
    )
    .await;
    registry.release(&download_id);
    model_download::report_outcome(&app, recipe.id, outcome)
}

/// Delete an upscaler's file. Refused while the model downloads or an image job runs. Returns the
/// bytes freed.
#[tauri::command]
pub async fn playground_delete_upscale_model(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    jobs: State<'_, PlaygroundJobs>,
    model_id: String,
) -> Result<ModelDeletion, String> {
    let recipe = upscale_catalog::find_recipe(&model_id)?;
    let models_root = paths::models_root(&app_data_dir(&app)?);
    if jobs.is_running()? {
        return Err("An image is being made. Wait for it to finish, then delete the model.".into());
    }
    // Registering the download id refuses a download of this model until the delete ends.
    let download_id = model_download::download_id(recipe.id);
    registry.register(&download_id).map_err(|_| {
        format!(
            "{} is downloading. Cancel the download before deleting it.",
            recipe.name
        )
    })?;
    let outcome = upscale_files::delete_upscale_model_files(&models_root, recipe).await;
    registry.release(&download_id);
    outcome
}

/// Start one upscaling job in the background and return. Progress arrives as
/// `playground-image-progress` and the end as `playground-image-done`, with the result's `width`
/// and `height`. Fails at once when the picture is not a PNG or JPG within 30 MB and 1024 px on its
/// longest side, the model is not downloaded, the runtime is not installed, or another image is
/// being made. Runs on the CPU: the GPU backend crashes on upscaling.
#[tauri::command]
pub async fn playground_upscale_image(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    jobs: State<'_, PlaygroundJobs>,
    request: UpscaleRequest,
) -> Result<(), String> {
    paths::validate_job_id(&request.job_id)?;
    let recipe = upscale_catalog::find_recipe(&request.model_id)?;
    let input = input_image::validate_input_image(&request.input_path)?;
    let (width, height) = input_image::image_dimensions(&input.path)?;
    upscale_args::check_input_size(width, height)?;
    let models_root = paths::models_root(&app_data_dir(&app)?);
    if !upscale_catalog::is_downloaded(recipe, &models_root) {
        return Err(format!(
            "{} is not downloaded yet. Download it first.",
            recipe.name
        ));
    }
    let program = installed_program(&db).await?;
    // The same CPU choice image generation makes when no device is asked for.
    let backend = devices::resolve_backend(&program, None).await?;

    let output_folder = paths::output_folder(&pictures_dir(&app)?);
    tokio::fs::create_dir_all(&output_folder)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", output_folder.display()))?;
    let stem = paths::upscaled_stem(&input.path, &file_timestamp());
    let output = paths::free_output_path(&output_folder, &stem)?;
    let args = upscale_args::upscale_args(
        &upscale_catalog::local_path(&models_root, recipe),
        &input.path,
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
            steps: 0,
            seed: 0,
            result_size: Some(upscale_args::upscaled_size(width, height)),
        },
    )
}
