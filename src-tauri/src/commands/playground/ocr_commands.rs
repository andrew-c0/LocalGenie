//! The Playground's OCR commands: the model list, model download and delete, the OCR job and saving
//! its text. OCR models are GenieX models (llama.cpp vision-language models), so they are imported
//! into GenieX, show in the Models tab, and run through the GenieX server.

use std::collections::HashSet;

use sea_orm::DatabaseConnection;
use tauri::{AppHandle, State};

use super::model_delete::ModelDeletion;
use super::model_download;
use super::ocr_catalog::{self, OcrModel, OcrRecipe};
use super::ocr_download::OcrDownload;
use super::ocr_job::{OcrJob, OcrJobs};
use super::ocr_request::{self, OcrRequest};
use super::{input_image, paths};
use crate::commands::download::{download_dir, DownloadRegistry};
use crate::commands::{benchmark_runs, database, models, server, AppState};

/// The repos GenieX has. Read from `geniex list`; when that fails, from the stored model rows.
async fn installed_repos(db: &DatabaseConnection) -> HashSet<String> {
    match models::installed_model_sizes().await {
        Ok(sizes) => sizes.into_keys().collect(),
        Err(e) => {
            eprintln!("Could not list GenieX models, using the stored rows: {e}");
            let mut found = HashSet::new();
            for recipe in ocr_catalog::RECIPES {
                if database::has_downloaded_model(db, recipe.repo)
                    .await
                    .unwrap_or(false)
                {
                    found.insert(recipe.repo.to_string());
                }
            }
            found
        }
    }
}

/// The curated OCR models, with whether GenieX has each one.
#[tauri::command]
pub async fn playground_ocr_models(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<OcrModel>, String> {
    let installed = installed_repos(&db).await;
    Ok(ocr_catalog::RECIPES
        .iter()
        .map(|recipe| ocr_catalog::describe(recipe, installed.contains(recipe.repo)))
        .collect())
}

/// Download an OCR model's files and import them into GenieX. Progress arrives as
/// `playground-download-progress` and the end as `playground-download-done`; the import also emits
/// the Models tab's `model-pull-*` events. Cancel with `cancel_download("playground:<model id>")`.
/// Resolves when the run ends; an error rejects too.
#[tauri::command]
pub async fn playground_download_ocr_model(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    state: State<'_, AppState>,
    db: State<'_, DatabaseConnection>,
    model_id: String,
) -> Result<(), String> {
    let recipe = ocr_catalog::find_recipe(&model_id)?;
    let download_id = model_download::download_id(recipe.id);
    let cancel = registry.register(&download_id)?;
    let outcome = OcrDownload {
        app: &app,
        download_client: registry.client(),
        http_client: &state.http_client,
        db: &db,
        cancel: &cancel,
    }
    .run(recipe)
    .await;
    registry.release(&download_id);
    model_download::report_outcome(&app, recipe.id, outcome)
}

/// Remove an OCR model from GenieX and forget its stored row. Refused while the model downloads or
/// an OCR job runs. Returns the bytes freed.
#[tauri::command]
pub async fn playground_delete_ocr_model(
    registry: State<'_, DownloadRegistry>,
    jobs: State<'_, OcrJobs>,
    db: State<'_, DatabaseConnection>,
    model_id: String,
) -> Result<ModelDeletion, String> {
    let recipe = ocr_catalog::find_recipe(&model_id)?;
    if jobs.is_running()? {
        return Err("An OCR job is running. Wait for it to finish, then delete the model.".into());
    }
    // Registering the download id refuses a download of this model until the delete ends.
    let download_id = model_download::download_id(recipe.id);
    registry.register(&download_id).map_err(|_| {
        format!(
            "{} is downloading. Cancel the download before deleting it.",
            recipe.name
        )
    })?;
    let outcome = delete_model(&db, recipe).await;
    registry.release(&download_id);
    outcome
}

async fn delete_model(
    db: &DatabaseConnection,
    recipe: &OcrRecipe,
) -> Result<ModelDeletion, String> {
    let sizes = models::installed_model_sizes().await.ok();
    // When the list is unavailable, try the removal anyway.
    let installed = sizes
        .as_ref()
        .is_none_or(|sizes| sizes.contains_key(recipe.repo));
    let mut freed_bytes = sizes
        .as_ref()
        .and_then(|sizes| sizes.get(recipe.repo))
        .copied()
        .unwrap_or(0);
    if installed {
        models::remove_model(recipe.repo.to_string()).await?;
    }
    database::forget_downloaded_model(db, recipe.repo).await?;
    freed_bytes += remove_leftovers(recipe).await;
    Ok(ModelDeletion { freed_bytes })
}

/// Remove files of `recipe` an unfinished or failed download left in Downloads, and the folder when
/// nothing else is in it. Returns the bytes removed.
async fn remove_leftovers(recipe: &OcrRecipe) -> u64 {
    let Some(folder) = download_dir().map(|dir| dir.join(recipe.folder())) else {
        return 0;
    };
    let mut freed = 0;
    for file in recipe.files_in_order() {
        for name in [file.name.to_string(), format!("{}.part", file.name)] {
            let path = folder.join(name);
            let bytes = tokio::fs::metadata(&path)
                .await
                .map(|meta| meta.len())
                .unwrap_or(0);
            if tokio::fs::remove_file(&path).await.is_ok() {
                freed += bytes;
            }
        }
    }
    let _ = tokio::fs::remove_dir(&folder).await;
    freed
}

/// Start one OCR job in the background and return. The end arrives as `playground-ocr-done`. Fails
/// at once when the model is unknown or not downloaded, the mode is not one of the model's, the
/// picture is not a PNG or JPG within 30 MB and 2500 px on its longest side, the GenieX server is
/// not running, or another OCR job runs.
#[tauri::command]
pub async fn playground_ocr_run(
    app: AppHandle,
    state: State<'_, AppState>,
    db: State<'_, DatabaseConnection>,
    jobs: State<'_, OcrJobs>,
    request: OcrRequest,
) -> Result<(), String> {
    paths::validate_job_id(&request.job_id)?;
    let recipe = ocr_catalog::find_recipe(&request.model_id)?;
    let prompt = recipe.mode(request.mode)?.prompt;
    let image = input_image::validate_input_image(&request.image_path)?;
    let (width, height) = input_image::image_dimensions(&image.path)?;
    ocr_request::check_image_size(width, height)?;
    if !installed_repos(&db).await.contains(recipe.repo) {
        return Err(format!(
            "{} is not downloaded yet. Download it first.",
            recipe.name
        ));
    }
    let base_url = ocr_request::base_url(request.port);
    server::fetch_loaded_models(&state.http_client, &base_url)
        .await
        .map_err(|_| "Start the GenieX server first".to_string())?;
    jobs.start(
        &app,
        &state.http_client,
        OcrJob {
            job_id: request.job_id,
            base_url,
            recipe,
            mode: request.mode,
            prompt,
            image,
            compute: request.compute,
            vision_compute: request.vision_compute,
        },
    )
}

/// Cancel the running OCR job. The request is dropped and the job ends as `cancelled`; the server
/// may keep generating until it notices the closed connection.
#[tauri::command]
pub fn playground_cancel_ocr(jobs: State<'_, OcrJobs>, job_id: String) -> Result<(), String> {
    jobs.request_cancel(&job_id)
}

/// Ask where to save, then write `text` there as a UTF-8 `.txt` file. Resolves to the saved path,
/// or null when the user cancels.
#[tauri::command]
pub async fn playground_save_ocr_text(
    app: AppHandle,
    text: String,
    default_name: String,
) -> Result<Option<String>, String> {
    benchmark_runs::save_with_dialog(&app, text.into_bytes(), &default_name, "Text", "txt").await
}
