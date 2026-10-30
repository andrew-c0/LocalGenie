//! The Playground's speech commands: the speech model list, model downloads and deletes, speech to
//! text and text to speech jobs, and the microphone recordings and speech files the webview reads
//! back. Each command checks its input and hands the work to the module that owns it.

use std::path::PathBuf;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use sea_orm::DatabaseConnection;
use tauri::{AppHandle, Manager, State};

use super::model_delete::ModelDeletion;
use super::model_download;
use super::paths;
use super::recordings;
use super::speech_args::{self, SynthesizeRequest, TranscribeRequest, VoiceChoice, WAV_EXTENSION};
use super::speech_catalog::{self, Engine, SpeechKind, SpeechModel};
use super::speech_delete;
use super::speech_download;
use super::speech_job::{self, SpeechJob, SpeechJobs};
use super::{app_data_dir, file_timestamp, music_dir};
use crate::commands::attachments;
use crate::commands::download::DownloadRegistry;
use crate::commands::runtimes::sherpa_cli;

/// Largest WAV `playground_read_audio` returns, in bytes. The data URL is about a third longer.
const MAX_AUDIO_READ_BYTES: u64 = 200 * 1024 * 1024;

/// Every speech model (speech to text and text to speech), with its download state and voices.
#[tauri::command]
pub fn playground_speech_models(app: AppHandle) -> Result<Vec<SpeechModel>, String> {
    let models_root = paths::models_root(&app_data_dir(&app)?);
    Ok(speech_catalog::all_recipes()
        .map(|recipe| speech_catalog::describe(recipe, &models_root))
        .collect())
}

/// Download and unpack a speech model. Progress arrives as `playground-download-progress` and the
/// end as `playground-download-done`. Cancel with `cancel_download("playground:<model id>")`.
/// Resolves when the run ends; an error rejects too.
#[tauri::command]
pub async fn playground_download_speech_model(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    model_id: String,
) -> Result<(), String> {
    let recipe = speech_catalog::find_recipe(&model_id)?;
    let models_root = paths::models_root(&app_data_dir(&app)?);
    let download_id = model_download::download_id(recipe.id);
    let cancel = registry.register(&download_id)?;
    let outcome = speech_download::download_speech_model(
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

/// Delete a speech model's files. Refused while the model downloads or a speech job runs. Returns
/// the bytes freed.
#[tauri::command]
pub async fn playground_delete_speech_model(
    app: AppHandle,
    registry: State<'_, DownloadRegistry>,
    jobs: State<'_, SpeechJobs>,
    model_id: String,
) -> Result<ModelDeletion, String> {
    let recipe = speech_catalog::find_recipe(&model_id)?;
    let models_root = paths::models_root(&app_data_dir(&app)?);
    if jobs.is_running()? {
        return Err(
            "A speech job is running. Wait for it to finish, then delete the model.".to_string(),
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
    let outcome = speech_delete::delete_speech_model_files(&models_root, recipe).await;
    registry.release(&download_id);
    outcome
}

/// Start a speech to text job in the background and return. Progress arrives as
/// `playground-speech-progress` and the end as `playground-speech-done`. Fails at once when the
/// model is not a speech to text model, is not downloaded, the runtime is not installed, the audio
/// is not a WAV file, or another speech job is running.
#[tauri::command]
pub async fn playground_transcribe(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    jobs: State<'_, SpeechJobs>,
    request: TranscribeRequest,
) -> Result<(), String> {
    paths::validate_job_id(&request.job_id)?;
    let recipe = speech_catalog::find_recipe(&request.model_id)?;
    let Engine::Stt(engine) = recipe.engine else {
        return Err(format!("{} is not a speech to text model.", recipe.name));
    };
    let models_root = paths::models_root(&app_data_dir(&app)?);
    speech_catalog::require_downloaded(recipe, &models_root)?;
    let audio = speech_args::checked_audio_input(&request.audio_path)?;
    let programs = sherpa_cli::sherpa_programs(&db).await?;

    let args = speech_args::transcribe_args(
        engine,
        &speech_catalog::model_dir(&models_root, recipe),
        &audio,
    );
    jobs.start(
        &app,
        SpeechJob {
            job_id: request.job_id,
            kind: SpeechKind::Stt,
            program: programs.offline,
            folder: programs.bin_dir,
            args,
            audio,
            outputs: Vec::new(),
        },
    )
}

/// Start a text to speech job in the background and return. The speech is saved as a WAV in
/// `<Music>/LocalGenie/` and its path comes in `playground-speech-done`. Fails at once when the
/// model is not a text to speech model, the voice or speed is not allowed (a voice cloning model
/// needs a readable, non-empty WAV in `referenceAudioPath` instead and ignores both), the text is empty or too
/// long, the model is not downloaded, the runtime is not installed, or another speech job is running.
#[tauri::command]
pub async fn playground_synthesize(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    jobs: State<'_, SpeechJobs>,
    request: SynthesizeRequest,
) -> Result<(), String> {
    paths::validate_job_id(&request.job_id)?;
    let recipe = speech_catalog::find_recipe(&request.model_id)?;
    let Engine::Tts(engine) = recipe.engine else {
        return Err(format!("{} is not a text to speech model.", recipe.name));
    };
    // A cloning model takes its voice from the reference recording and ignores voice and speed; the
    // other models ignore the recording.
    let reference = if recipe.needs_reference() {
        Some(speech_args::checked_reference_audio(
            request.reference_audio_path.as_deref(),
        )?)
    } else {
        None
    };
    let speaker = if reference.is_some() {
        None
    } else {
        if recipe.voice(request.voice_id).is_none() {
            return Err(format!(
                "{} has no voice {}.",
                recipe.name, request.voice_id
            ));
        }
        Some((request.voice_id, speech_args::checked_speed(request.speed)?))
    };
    let text = speech_args::checked_text(&request.text)?;
    let models_root = paths::models_root(&app_data_dir(&app)?);
    speech_catalog::require_downloaded(recipe, &models_root)?;
    let programs = sherpa_cli::sherpa_programs(&db).await?;

    let output_folder = paths::speech_output_folder(&music_dir(&app)?);
    tokio::fs::create_dir_all(&output_folder)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", output_folder.display()))?;
    let stem = format!(
        "speech-{}-{}",
        paths::slug_from_prompt(&text),
        file_timestamp()
    );
    let output = paths::free_path(&output_folder, &stem, WAV_EXTENSION)?;
    let voice = match (&reference, speaker) {
        (Some(path), _) => VoiceChoice::Reference(path),
        (None, Some((voice_id, speed))) => VoiceChoice::Speaker { voice_id, speed },
        (None, None) => return Err("No voice was chosen.".to_string()),
    };
    let args = speech_args::synthesize_args(
        engine,
        &speech_catalog::model_dir(&models_root, recipe),
        &text,
        voice,
        &output,
    )?;
    jobs.start(
        &app,
        SpeechJob {
            job_id: request.job_id,
            kind: SpeechKind::Tts,
            program: programs.tts,
            folder: programs.bin_dir,
            args,
            audio: output,
            outputs: Vec::new(),
        },
    )
}

/// Stop the running speech job. Its process is killed, and `playground-speech-done` then arrives
/// with status `cancelled`. Does nothing when `job_id` is not the running job.
#[tauri::command]
pub async fn playground_cancel_speech(
    jobs: State<'_, SpeechJobs>,
    job_id: String,
) -> Result<(), String> {
    speech_job::cancel_job(&jobs, &job_id).await
}

/// Save a microphone recording as a WAV under the app cache and return its path. Only WAV is
/// accepted, and recordings older than a day are removed on each call.
#[tauri::command]
pub async fn playground_store_audio(
    app: AppHandle,
    bytes: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    recordings::validate_recording(&bytes, &extension, recordings::MAX_RECORDING_BYTES)?;
    let folder = paths::recordings_folder(&cache_dir(&app)?);
    tokio::fs::create_dir_all(&folder)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", folder.display()))?;
    recordings::remove_stale_recordings(&folder).await;
    let stem = recordings::recording_stem(&file_timestamp());
    let path = paths::free_path(&folder, &stem, WAV_EXTENSION)?;
    tokio::fs::write(&path, &bytes)
        .await
        .map_err(|e| format!("Failed to save the recording: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// A recording or saved speech file as a `data:audio/wav;base64,` URL. The path must be inside the
/// recordings folder or the speech folder.
#[tauri::command]
pub async fn playground_read_audio(app: AppHandle, path: String) -> Result<String, String> {
    let file = paths::resolve_file_path(&path, &audio_roots(&app)?, WAV_EXTENSION)?;
    let size = tokio::fs::metadata(&file)
        .await
        .map_err(|e| format!("Cannot read {path}: {e}"))?
        .len();
    if size > MAX_AUDIO_READ_BYTES {
        return Err(format!(
            "The audio is larger than {} MB.",
            MAX_AUDIO_READ_BYTES / (1024 * 1024)
        ));
    }
    let bytes = tokio::fs::read(&file)
        .await
        .map_err(|e| format!("Cannot read {path}: {e}"))?;
    Ok(format!("data:audio/wav;base64,{}", STANDARD.encode(bytes)))
}

/// Select a recording or saved speech file in its folder in Explorer. The path must be inside the
/// recordings folder or the speech folder.
#[tauri::command]
pub fn playground_reveal_audio(app: AppHandle, path: String) -> Result<(), String> {
    let file = paths::resolve_file_path(&path, &audio_roots(&app)?, WAV_EXTENSION)?;
    attachments::reveal_in_explorer(&paths::without_verbatim_prefix(&file))
}

/// The folders audio may be read from: the recordings folder and the speech folder.
fn audio_roots(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    Ok(vec![
        paths::recordings_folder(&cache_dir(app)?),
        paths::speech_output_folder(&music_dir(app)?),
    ])
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map_err(|e| format!("app cache folder unavailable: {e}"))
}
