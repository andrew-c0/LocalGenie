//! The Playground's audio to audio command. A denoise or separate model runs as one job in the speech
//! job slot, so it shares the slot, the `playground-speech-*` events and `playground_cancel_speech`
//! with speech to text and text to speech. The command checks its input and hands the job to
//! `audio_job`.

use sea_orm::DatabaseConnection;
use tauri::{AppHandle, State};

use super::audio_args::EnhanceRequest;
use super::audio_job;
use super::paths;
use super::speech_args;
use super::speech_catalog::{self, SpeechKind};
use super::speech_job::SpeechJobs;
use crate::commands::runtimes::sherpa_cli;

/// Start an audio to audio job in the background and return. The outputs are WAV files in
/// `<Music>/LocalGenie/`, and their paths come in `playground-speech-done` as `outputs`. Fails at
/// once when the model is not a denoise or separate model, is not downloaded, the input is not a WAV
/// file, the runtime is not installed, or another speech job is running.
#[tauri::command]
pub async fn playground_enhance_audio(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    jobs: State<'_, SpeechJobs>,
    request: EnhanceRequest,
) -> Result<(), String> {
    paths::validate_job_id(&request.job_id)?;
    let recipe = speech_catalog::find_recipe(&request.model_id)?;
    if !matches!(recipe.kind(), SpeechKind::Denoise | SpeechKind::Separate) {
        return Err(format!("{} is not an audio to audio model.", recipe.name));
    }
    let models_root = paths::models_root(&super::app_data_dir(&app)?);
    speech_catalog::require_downloaded(recipe, &models_root)?;
    let input = speech_args::checked_audio_input(&request.audio_path)?;
    let programs = sherpa_cli::sherpa_programs(&db).await?;

    let output_folder = paths::speech_output_folder(&super::music_dir(&app)?);
    tokio::fs::create_dir_all(&output_folder)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", output_folder.display()))?;
    let job = audio_job::enhance_job(
        &request.job_id,
        recipe,
        &models_root,
        programs,
        input,
        &output_folder,
        &super::file_timestamp(),
    )?;
    jobs.start(&app, job)
}
