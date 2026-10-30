//! Downloads and deletes an upscaler's `.pth` file. Progress goes out as the same
//! `playground-download-progress` events the image models use. The file is written to `<name>.part`
//! and renamed when its size matches, so a cancelled download resumes on the next attempt.

use std::path::Path;
use std::sync::atomic::AtomicBool;

use tauri::AppHandle;

use super::model_delete::{partial_path, ModelDeletion};
use super::model_download::{emit_progress, DownloadEnd, DownloadProgressEvent};
use super::paths;
use super::upscale_catalog::{self, UpscaleRecipe};
use crate::commands::download::{stream_to_partial, Transfer, TransferProgress};

/// Download `recipe` into `models_root`. Does nothing when the file is already on disk. Stops at
/// once when `cancel` is set, and then returns `Cancelled`.
pub(super) async fn download_upscale_model(
    app: &AppHandle,
    client: &reqwest::Client,
    models_root: &Path,
    recipe: &UpscaleRecipe,
    cancel: &AtomicBool,
) -> Result<DownloadEnd, String> {
    if upscale_catalog::is_downloaded(recipe, models_root) {
        return Ok(DownloadEnd::Finished);
    }
    if !upscale_catalog::is_allowed_upscale_url(recipe.url) {
        return Err(format!("{} is not an allowed download.", recipe.url));
    }
    let target = upscale_catalog::local_path(models_root, recipe);
    let target_dir = target.parent().unwrap_or(models_root);
    tokio::fs::create_dir_all(target_dir)
        .await
        .map_err(|e| format!("Failed to create {}: {e}", target_dir.display()))?;

    let partial = partial_path(&target);
    let on_progress = |progress: TransferProgress| {
        emit_progress(app, &progress_event(recipe, progress));
    };
    let finished =
        match stream_to_partial(client, recipe.url, &partial, Some(cancel), on_progress).await? {
            Transfer::Cancelled => return Ok(DownloadEnd::Cancelled),
            Transfer::Finished(progress) => progress,
        };
    finish_download(&partial, &target, recipe, finished.received).await?;
    Ok(DownloadEnd::Finished)
}

/// Check the downloaded bytes against the catalogue's size, then move the partial file to the
/// target's name. A file of the wrong size is deleted, so it is downloaded again next time.
async fn finish_download(
    partial: &Path,
    target: &Path,
    recipe: &UpscaleRecipe,
    received: u64,
) -> Result<(), String> {
    let name = recipe.file_name();
    if received != recipe.size_bytes {
        let _ = tokio::fs::remove_file(partial).await;
        return Err(format!(
            "{name} is {received} bytes, but the catalogue expects {}. The catalogue may be out of date.",
            recipe.size_bytes
        ));
    }
    tokio::fs::rename(partial, target)
        .await
        .map_err(|e| format!("Failed to finish {name}: {e}"))
}

/// The progress event for the download. An upscaler is one file, so its position is 0 of 1.
fn progress_event(recipe: &UpscaleRecipe, progress: TransferProgress) -> DownloadProgressEvent {
    DownloadProgressEvent {
        model_id: recipe.id.to_string(),
        file_name: recipe.file_name().to_string(),
        file_index: 0,
        file_count: 1,
        received: progress.received,
        total: progress.total.unwrap_or(0),
    }
}

/// Delete the model file and its partial download. Returns the bytes freed. Nothing is deleted
/// when a path is outside `models_root`, including through a symbolic link.
pub(super) async fn delete_upscale_model_files(
    models_root: &Path,
    recipe: &UpscaleRecipe,
) -> Result<ModelDeletion, String> {
    let file = upscale_catalog::local_path(models_root, recipe);
    let mut to_delete = Vec::new();
    for path in [partial_path(&file), file] {
        if path.is_file() {
            let inside = paths::contained_path(&path, models_root)?;
            let bytes = std::fs::metadata(&inside)
                .map_err(|e| format!("Cannot read {}: {e}", path.display()))?
                .len();
            to_delete.push((path, bytes));
        }
    }
    for (path, _) in &to_delete {
        tokio::fs::remove_file(path)
            .await
            .map_err(|e| format!("Failed to delete {}: {e}", path.display()))?;
    }
    if let Some(folder) = upscale_catalog::local_path(models_root, recipe).parent() {
        // Only removes the folder when it is empty now.
        let _ = tokio::fs::remove_dir(folder).await;
    }
    Ok(ModelDeletion {
        freed_bytes: to_delete.iter().map(|(_, bytes)| bytes).sum(),
    })
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{try_file_link, Scratch};
    use super::*;

    fn nomos() -> &'static UpscaleRecipe {
        upscale_catalog::find_recipe("nomos2-hq-mosr-x4").expect("nomos")
    }

    #[test]
    fn progress_is_for_the_file_as_one_of_one() {
        let event = progress_event(
            nomos(),
            TransferProgress {
                received: 10,
                total: None,
                speed_bps: 0,
            },
        );
        assert_eq!(event.model_id, "nomos2-hq-mosr-x4");
        assert_eq!(event.file_name, "4xNomos2_hq_mosr.pth");
        assert_eq!((event.file_index, event.file_count), (0, 1));
        assert_eq!(event.total, 0, "an unknown length is 0");
    }

    #[tokio::test]
    async fn a_file_of_the_right_size_is_renamed_into_place() {
        let scratch = Scratch::new("upscale-finish");
        let recipe = nomos();
        let target = scratch.path().join("m.pth");
        let partial = partial_path(&target);
        std::fs::write(&partial, b"pth").expect("partial");

        finish_download(&partial, &target, recipe, recipe.size_bytes)
            .await
            .expect("right size");

        assert!(target.is_file());
        assert!(!partial.exists());
    }

    #[tokio::test]
    async fn a_file_of_the_wrong_size_is_deleted_and_not_kept() {
        let scratch = Scratch::new("upscale-wrong-size");
        let target = scratch.path().join("m.pth");
        let partial = partial_path(&target);
        std::fs::write(&partial, b"short").expect("partial");

        let error = finish_download(&partial, &target, nomos(), 5)
            .await
            .expect_err("wrong size");

        assert!(error.contains("4xNomos2_hq_mosr.pth is 5 bytes"), "{error}");
        assert!(!partial.exists() && !target.exists());
    }

    #[tokio::test]
    async fn deleting_removes_the_file_its_partial_and_the_empty_folder() {
        let scratch = Scratch::new("upscale-delete");
        let root = scratch.path().join("playground-models");
        let file = upscale_catalog::local_path(&root, nomos());
        std::fs::create_dir_all(file.parent().expect("parent")).expect("folder");
        std::fs::write(&file, b"0123456789").expect("file");
        std::fs::write(partial_path(&file), b"xxxxx").expect("partial");

        let deletion = delete_upscale_model_files(&root, nomos())
            .await
            .expect("delete");

        assert_eq!(deletion.freed_bytes, 15);
        assert!(!file.exists() && !partial_path(&file).exists());
        assert!(!file.parent().expect("parent").exists());
        assert!(root.is_dir(), "the models folder stays");
    }

    #[tokio::test]
    async fn deleting_keeps_the_other_model_and_its_folder() {
        let scratch = Scratch::new("upscale-delete-other");
        let root = scratch.path().join("playground-models");
        let other = upscale_catalog::find_recipe("realesrgan-x4plus-anime-6b").expect("anime");
        for recipe in [nomos(), other] {
            let file = upscale_catalog::local_path(&root, recipe);
            std::fs::create_dir_all(file.parent().expect("parent")).expect("folder");
            std::fs::write(&file, b"01").expect("file");
        }

        delete_upscale_model_files(&root, nomos())
            .await
            .expect("delete");

        assert!(upscale_catalog::is_downloaded(other, &root));
        assert!(!upscale_catalog::is_downloaded(nomos(), &root));
    }

    #[tokio::test]
    async fn deleting_a_model_with_nothing_on_disk_frees_nothing() {
        let scratch = Scratch::new("upscale-delete-none");
        let root = scratch.path().join("playground-models");
        let deletion = delete_upscale_model_files(&root, nomos())
            .await
            .expect("delete");
        assert_eq!(deletion, ModelDeletion { freed_bytes: 0 });
    }

    #[tokio::test]
    async fn a_link_out_of_the_models_folder_stops_the_delete() {
        let scratch = Scratch::new("upscale-delete-escape");
        let root = scratch.path().join("playground-models");
        let file = upscale_catalog::local_path(&root, nomos());
        std::fs::create_dir_all(file.parent().expect("parent")).expect("folder");
        let outside = scratch.path().join("outside.pth");
        std::fs::write(&outside, b"keep me").expect("outside");
        if !try_file_link(&outside, &file) {
            return;
        }

        assert!(delete_upscale_model_files(&root, nomos()).await.is_err());
        assert!(outside.is_file());
    }
}
