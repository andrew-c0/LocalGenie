//! Downloads a speech model's sherpa-onnx archive from its GitHub release, checks its size, and
//! unpacks it into the model's folder. Progress goes out as the same `playground-download-progress`
//! events the image models use. A cancelled download keeps its partial file, so the next attempt
//! resumes it. The archive is deleted once it is unpacked.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use tauri::AppHandle;

use super::model_delete::partial_path;
use super::model_download::{emit_progress, DownloadEnd, DownloadProgressEvent};
use super::speech_catalog::{self, SpeechRecipe};
use crate::commands::download::{stream_to_partial, Transfer, TransferProgress};
use crate::commands::runtimes::archive::extract_tar_bz2;

/// Download and unpack `recipe` into `models_root`. Does nothing when the model is already on disk.
/// Stops at once when `cancel` is set, and then returns `Cancelled`.
pub(super) async fn download_speech_model(
    app: &AppHandle,
    client: &reqwest::Client,
    models_root: &Path,
    recipe: &SpeechRecipe,
    cancel: &AtomicBool,
) -> Result<DownloadEnd, String> {
    if speech_catalog::is_downloaded(recipe, models_root) {
        return Ok(DownloadEnd::Finished);
    }
    let url = speech_catalog::download_url(recipe);
    if !speech_catalog::is_allowed_speech_url(&url) {
        return Err(format!("{url} is not an allowed download."));
    }
    let repo_dir = speech_catalog::repo_dir(models_root);
    tokio::fs::create_dir_all(&repo_dir)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", repo_dir.display()))?;

    let archive = speech_catalog::archive_path(models_root, recipe);
    let partial = partial_path(&archive);
    let on_progress = |progress: TransferProgress| {
        emit_progress(app, &progress_event(recipe, progress));
    };
    let finished =
        match stream_to_partial(client, &url, &partial, Some(cancel), on_progress).await? {
            Transfer::Cancelled => return Ok(DownloadEnd::Cancelled),
            Transfer::Finished(progress) => progress,
        };
    check_size_and_finish(&partial, &archive, recipe, finished.received).await?;

    let folder = speech_catalog::model_dir(models_root, recipe);
    unpack_model(&archive, &folder).await?;
    if !speech_catalog::is_downloaded(recipe, models_root) {
        let _ = tokio::fs::remove_dir_all(&folder).await;
        return Err(format!(
            "{} did not unpack the files the model needs.",
            recipe.archive_name
        ));
    }
    Ok(DownloadEnd::Finished)
}

/// Check the downloaded bytes against the catalogue's size, then move the partial file to the
/// archive's name. A file of the wrong size is deleted, so it is downloaded again next time.
async fn check_size_and_finish(
    partial: &Path,
    archive: &Path,
    recipe: &SpeechRecipe,
    received: u64,
) -> Result<(), String> {
    if received != recipe.size_bytes {
        let _ = tokio::fs::remove_file(partial).await;
        return Err(format!(
            "{} is {} bytes, but the catalogue expects {}. The catalogue may be out of date.",
            recipe.archive_name, received, recipe.size_bytes
        ));
    }
    tokio::fs::rename(partial, archive)
        .await
        .map_err(|e| format!("Failed to finish {}: {e}", recipe.archive_name))
}

/// Unpack `archive` into `folder` on a blocking thread, then delete the archive. A failed unpack
/// removes the folder too, so the next download starts clean.
async fn unpack_model(archive: &Path, folder: &Path) -> Result<(), String> {
    let source: PathBuf = archive.to_path_buf();
    let target: PathBuf = folder.to_path_buf();
    let unpacked = tokio::task::spawn_blocking(move || extract_tar_bz2(&source, &target, true))
        .await
        .map_err(|e| format!("Unpacking the model stopped: {e}"))?;
    let _ = tokio::fs::remove_file(archive).await;
    if let Err(message) = unpacked {
        let _ = tokio::fs::remove_dir_all(folder).await;
        return Err(message);
    }
    Ok(())
}

/// The progress event for the archive. A speech model is one file, so its position is 0 of 1.
fn progress_event(recipe: &SpeechRecipe, progress: TransferProgress) -> DownloadProgressEvent {
    DownloadProgressEvent {
        model_id: recipe.id.to_string(),
        file_name: recipe.archive_name.to_string(),
        file_index: 0,
        file_count: 1,
        received: progress.received,
        total: progress.total.unwrap_or(0),
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::Scratch;
    use super::*;

    #[test]
    fn progress_is_for_the_archive_as_one_file() {
        let recipe = speech_catalog::find_recipe("whisper-tiny-en").expect("recipe");
        let event = progress_event(
            recipe,
            TransferProgress {
                received: 10,
                total: None,
                speed_bps: 0,
            },
        );
        assert_eq!(event.model_id, "whisper-tiny-en");
        assert_eq!(event.file_name, "sherpa-onnx-whisper-tiny.en.tar.bz2");
        assert_eq!((event.file_index, event.file_count), (0, 1));
        assert_eq!(event.total, 0, "an unknown length is 0");
    }

    #[tokio::test]
    async fn unpacking_puts_the_model_files_in_the_folder_and_deletes_the_archive() {
        let scratch = Scratch::new("speech-unpack");
        let folder = scratch.path().join("whisper-tiny-en");
        let archive = scratch.path().join("sherpa-onnx-test.tar.bz2");
        write_archive(&archive, "sherpa-onnx-test", &[("tokens.txt", b"a\n")]);

        unpack_model(&archive, &folder).await.expect("unpack");

        assert_eq!(
            std::fs::read(folder.join("tokens.txt")).expect("tokens"),
            b"a\n"
        );
        assert!(
            !folder.join("sherpa-onnx-test").exists(),
            "top folder is stripped"
        );
        assert!(!archive.exists(), "the archive is deleted");
    }

    #[tokio::test]
    async fn a_broken_archive_leaves_no_folder_behind() {
        let scratch = Scratch::new("speech-unpack-broken");
        let folder = scratch.path().join("moonshine-base-en");
        let archive = scratch.path().join("broken.tar.bz2");
        std::fs::write(&archive, b"not a bz2 archive").expect("archive");

        let error = unpack_model(&archive, &folder).await.expect_err("broken");

        assert!(error.contains("not a valid tar.bz2"), "{error}");
        assert!(!folder.exists());
        assert!(!archive.exists());
    }

    /// A tar.bz2 with one top-level folder, holding `files`.
    fn write_archive(path: &Path, top: &str, files: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).expect("create");
        let encoder = bzip2::write::BzEncoder::new(file, bzip2::Compression::fast());
        let mut builder = tar::Builder::new(encoder);
        for (name, body) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(body.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder
                .append_data(&mut header, format!("{top}/{name}"), *body)
                .expect("entry");
        }
        builder.into_inner().expect("tar").finish().expect("bz2");
    }
}
