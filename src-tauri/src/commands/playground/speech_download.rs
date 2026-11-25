//! Downloads a speech model from its GitHub release, checks its size, and puts it in the model's
//! folder: an archive is unpacked there, a single file is saved there as it is. A model with a
//! companion file (a Matcha vocoder, or a Kitten lexicon, each a separate release asset) fetches
//! that file into its folder after the archive, and only the files that are missing are fetched.
//! Progress goes out as the same `playground-download-progress` events the image
//! models use. A cancelled download keeps its partial file, so the next attempt resumes it. An
//! archive is deleted once it is unpacked.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::AppHandle;
use tokio::sync::{Mutex, MutexGuard};

use super::model_delete::partial_path;
use super::model_download::{emit_progress, DownloadEnd, DownloadProgressEvent};
use super::speech_catalog::{self, Delivery, SpeechRecipe};
use crate::commands::download::{stream_to_partial, Transfer, TransferProgress};
use crate::commands::runtimes::archive::extract_tar_bz2;

/// One release asset of a model: where it comes from, where it is saved and the size it must be.
struct Asset {
    url: String,
    file_name: &'static str,
    target: PathBuf,
    size_bytes: u64,
}

/// Download `recipe` into `models_root`. Does nothing when the model is already on disk. Stops at
/// once when `cancel` is set, and then returns `Cancelled`.
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
    let missing = missing_downloads(recipe, models_root);
    let count = missing.count();
    let mut position = 0;
    let folder = speech_catalog::model_dir(models_root, recipe);

    if missing.main {
        let main = Asset {
            url: speech_catalog::download_url(recipe),
            file_name: recipe.asset_name(),
            target: speech_catalog::download_target(models_root, recipe),
            size_bytes: recipe.size_bytes,
        };
        if matches!(
            fetch_asset(app, client, recipe, &main, cancel, (position, count)).await?,
            DownloadEnd::Cancelled
        ) {
            return Ok(DownloadEnd::Cancelled);
        }
        position += 1;
        if let Delivery::Archive { .. } = recipe.delivery {
            unpack_model(&main.target, &folder).await?;
        }
    }
    if let Some(companion) = recipe.companion().filter(|_| missing.companion) {
        let asset = Asset {
            url: speech_catalog::companion_url(companion),
            file_name: companion.file_name,
            target: folder.join(companion.file_name),
            size_bytes: companion.size_bytes,
        };
        if matches!(
            fetch_asset(app, client, recipe, &asset, cancel, (position, count)).await?,
            DownloadEnd::Cancelled
        ) {
            return Ok(DownloadEnd::Cancelled);
        }
        position += 1;
    }
    if let Some(lexicon) = recipe.shared_lexicon().filter(|_| missing.lexicon) {
        // The lexicon goes to the shared folder, so the other models that need it find it too.
        if matches!(
            fetch_shared_file(
                app,
                client,
                recipe,
                models_root,
                lexicon,
                cancel,
                (position, count)
            )
            .await?,
            DownloadEnd::Cancelled
        ) {
            return Ok(DownloadEnd::Cancelled);
        }
    }
    if !speech_catalog::is_downloaded(recipe, models_root) {
        let _ = tokio::fs::remove_dir_all(&folder).await;
        return Err(format!(
            "{} did not unpack the files the model needs.",
            recipe.asset_name()
        ));
    }
    Ok(DownloadEnd::Finished)
}

/// Serialises the fetches of shared files. Two models that need the same lexicon started together
/// wait here, so only one of them writes the partial file at a time.
static SHARED_FILE_LOCK: Mutex<()> = Mutex::const_new(());
/// How often a model waiting for `SHARED_FILE_LOCK` checks whether it was cancelled meanwhile.
const SHARED_LOCK_POLL: Duration = Duration::from_millis(100);

/// Fetch a shared file into the shared folder, unless it is complete once this model holds the lock:
/// then the model that held the lock before has fetched it already. Returns `Cancelled` when the
/// cancel is set while waiting, or during the fetch; the partial file is kept, so whichever model
/// fetches the file next resumes it.
async fn fetch_shared_file(
    app: &AppHandle,
    client: &reqwest::Client,
    recipe: &SpeechRecipe,
    models_root: &Path,
    shared: speech_catalog::Companion,
    cancel: &AtomicBool,
    position: (usize, usize),
) -> Result<DownloadEnd, String> {
    let Some(_guard) = wait_for_shared_lock(cancel).await else {
        return Ok(DownloadEnd::Cancelled);
    };
    let target = speech_catalog::shared_file_path(models_root, shared);
    let on_disk = tokio::fs::metadata(&target)
        .await
        .ok()
        .filter(|meta| meta.is_file())
        .map(|meta| meta.len());
    if !needs_fetch(on_disk, shared.size_bytes) {
        return Ok(DownloadEnd::Finished);
    }
    let asset = Asset {
        url: speech_catalog::companion_url(shared),
        file_name: shared.file_name,
        target,
        size_bytes: shared.size_bytes,
    };
    fetch_asset(app, client, recipe, &asset, cancel, position).await
}

/// Waits for `SHARED_FILE_LOCK`, checking `cancel` between tries. None when the cancel is set first.
async fn wait_for_shared_lock(cancel: &AtomicBool) -> Option<MutexGuard<'static, ()>> {
    loop {
        if let Ok(guard) = SHARED_FILE_LOCK.try_lock() {
            return Some(guard);
        }
        if cancel.load(Ordering::SeqCst) {
            return None;
        }
        tokio::time::sleep(SHARED_LOCK_POLL).await;
    }
}

/// True when a file must be fetched: it is not on disk (`on_disk` is None), or its size is not the
/// catalogue's. A file of the right size is complete, because it is only renamed into place then.
fn needs_fetch(on_disk: Option<u64>, expected_bytes: u64) -> bool {
    on_disk != Some(expected_bytes)
}

/// Which of a model's downloads are still needed: the main asset, unless its files are on disk; the
/// companion file in the model's folder, when that file is missing; and the shared lexicon, when it
/// is missing from the shared folder. A model whose lexicon is the only thing missing fetches just
/// that file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MissingDownloads {
    main: bool,
    companion: bool,
    lexicon: bool,
}

impl MissingDownloads {
    fn count(self) -> usize {
        usize::from(self.main) + usize::from(self.companion) + usize::from(self.lexicon)
    }
}

fn missing_downloads(recipe: &SpeechRecipe, models_root: &Path) -> MissingDownloads {
    let companion_missing = recipe.companion().is_some_and(|companion| {
        !speech_catalog::model_dir(models_root, recipe)
            .join(companion.file_name)
            .exists()
    });
    let lexicon_missing = recipe
        .shared_lexicon()
        .is_some_and(|lexicon| !speech_catalog::shared_file_path(models_root, lexicon).exists());
    MissingDownloads {
        main: !speech_catalog::main_files_on_disk(recipe, models_root),
        companion: companion_missing,
        lexicon: lexicon_missing,
    }
}

/// Fetch one release asset through its partial file, then move it to its target once its size is
/// the catalogue's. `position` is the file's place in the model's downloads, for the progress event.
async fn fetch_asset(
    app: &AppHandle,
    client: &reqwest::Client,
    recipe: &SpeechRecipe,
    asset: &Asset,
    cancel: &AtomicBool,
    position: (usize, usize),
) -> Result<DownloadEnd, String> {
    if !speech_catalog::is_allowed_speech_url(&asset.url) {
        return Err(format!("{} is not an allowed download.", asset.url));
    }
    if let Some(parent) = asset.target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create {}: {e}", parent.display()))?;
    }

    let partial = partial_path(&asset.target);
    let on_progress = |progress: TransferProgress| {
        emit_progress(
            app,
            &progress_event(recipe, asset.file_name, position, progress),
        );
    };
    let finished =
        match stream_to_partial(client, &asset.url, &partial, Some(cancel), on_progress).await? {
            Transfer::Cancelled => return Ok(DownloadEnd::Cancelled),
            Transfer::Finished(progress) => progress,
        };
    check_size_and_finish(
        &partial,
        &asset.target,
        asset.file_name,
        asset.size_bytes,
        finished.received,
    )
    .await?;
    Ok(DownloadEnd::Finished)
}

/// Check the downloaded bytes against the catalogue's size, then move the partial file to the
/// target's name. A file of the wrong size is deleted, so it is downloaded again next time.
async fn check_size_and_finish(
    partial: &Path,
    target: &Path,
    file_name: &str,
    expected_bytes: u64,
    received: u64,
) -> Result<(), String> {
    if received != expected_bytes {
        let _ = tokio::fs::remove_file(partial).await;
        return Err(format!(
            "{file_name} is {received} bytes, but the catalogue expects {expected_bytes}. The catalogue may be out of date."
        ));
    }
    tokio::fs::rename(partial, target)
        .await
        .map_err(|e| format!("Failed to finish {file_name}: {e}"))
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

/// The progress event for one of the model's downloads: `position` is (file index, file count).
fn progress_event(
    recipe: &SpeechRecipe,
    file_name: &str,
    position: (usize, usize),
    progress: TransferProgress,
) -> DownloadProgressEvent {
    DownloadProgressEvent {
        model_id: recipe.id.to_string(),
        file_name: file_name.to_string(),
        file_index: position.0,
        file_count: position.1,
        received: progress.received,
        total: progress.total.unwrap_or(0),
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::Scratch;
    use super::*;

    fn kitten() -> &'static SpeechRecipe {
        speech_catalog::find_recipe("kitten-nano-en-v0-2-fp16").expect("kitten")
    }

    #[test]
    fn progress_is_for_the_archive_as_one_file() {
        let recipe = speech_catalog::find_recipe("whisper-tiny-en").expect("recipe");
        let event = progress_event(
            recipe,
            recipe.asset_name(),
            (0, 1),
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

    #[test]
    fn progress_for_a_single_file_model_names_the_file() {
        let recipe = speech_catalog::find_recipe("dpdfnet4").expect("recipe");
        let event = progress_event(
            recipe,
            recipe.asset_name(),
            (0, 1),
            TransferProgress {
                received: 5,
                total: Some(11_707_436),
                speed_bps: 0,
            },
        );
        assert_eq!(event.model_id, "dpdfnet4");
        assert_eq!(event.file_name, "dpdfnet4.onnx");
        assert_eq!(event.total, 11_707_436);
    }

    #[test]
    fn a_matcha_model_reports_its_vocoder_as_the_second_of_two_files() {
        let recipe = speech_catalog::find_recipe("matcha-ljspeech").expect("recipe");
        let companion = recipe.companion().expect("vocoder");
        let event = progress_event(
            recipe,
            companion.file_name,
            (1, 2),
            TransferProgress {
                received: 1,
                total: Some(companion.size_bytes),
                speed_bps: 0,
            },
        );
        assert_eq!(event.file_name, "vocos-22khz-univ.onnx");
        assert_eq!((event.file_index, event.file_count), (1, 2));
    }

    #[test]
    fn a_kitten_model_with_only_its_lexicon_missing_fetches_just_the_lexicon() {
        let scratch = Scratch::new("speech-kitten-missing");
        let root = scratch.path();
        let folder = speech_catalog::model_dir(root, kitten());
        std::fs::create_dir_all(&folder).expect("folder");
        for entry in ["model.fp16.onnx", "voices.bin", "tokens.txt"] {
            std::fs::write(folder.join(entry), b"x").expect("file");
        }
        assert_eq!(
            missing_downloads(kitten(), root),
            MissingDownloads {
                main: false,
                companion: false,
                lexicon: true,
            },
            "the model's files are there, only the shared lexicon is missing"
        );

        std::fs::create_dir_all(speech_catalog::repo_dir(root)).expect("repo");
        let lexicon = kitten().shared_lexicon().expect("lexicon");
        std::fs::write(speech_catalog::shared_file_path(root, lexicon), b"x").expect("lexicon");
        assert!(speech_catalog::is_downloaded(kitten(), root));
        assert_eq!(missing_downloads(kitten(), root).count(), 0);
    }

    #[test]
    fn a_fresh_kitten_model_fetches_the_archive_and_the_lexicon() {
        let scratch = Scratch::new("speech-missing-fresh");
        let root = scratch.path();
        let both = MissingDownloads {
            main: true,
            companion: false,
            lexicon: true,
        };
        assert_eq!(missing_downloads(kitten(), root), both);
        assert_eq!(missing_downloads(kitten(), root).count(), 2);
    }

    #[test]
    fn a_fresh_matcha_model_fetches_the_archive_the_vocoder_and_the_lexicon() {
        let scratch = Scratch::new("speech-matcha-fresh");
        let matcha = speech_catalog::find_recipe("matcha-ljspeech").expect("matcha");
        assert_eq!(
            missing_downloads(matcha, scratch.path()),
            MissingDownloads {
                main: true,
                companion: true,
                lexicon: true,
            }
        );
    }

    #[test]
    fn a_matcha_model_with_only_its_vocoder_missing_skips_the_archive() {
        let scratch = Scratch::new("speech-matcha-missing");
        let root = scratch.path();
        let matcha = speech_catalog::find_recipe("matcha-ljspeech").expect("matcha");
        let folder = speech_catalog::model_dir(root, matcha);
        std::fs::create_dir_all(&folder).expect("folder");
        for entry in ["model-steps-3.onnx", "tokens.txt"] {
            std::fs::write(folder.join(entry), b"x").expect("file");
        }
        std::fs::create_dir_all(speech_catalog::repo_dir(root)).expect("repo");
        let lexicon = matcha.shared_lexicon().expect("lexicon");
        std::fs::write(speech_catalog::shared_file_path(root, lexicon), b"x").expect("lexicon");
        assert_eq!(
            missing_downloads(matcha, root),
            MissingDownloads {
                main: false,
                companion: true,
                lexicon: false,
            }
        );
    }

    #[test]
    fn a_single_file_model_has_no_companion_or_lexicon_to_fetch() {
        let scratch = Scratch::new("speech-missing-single");
        let gtcrn = speech_catalog::find_recipe("gtcrn-simple").expect("gtcrn");
        assert_eq!(
            missing_downloads(gtcrn, scratch.path()),
            MissingDownloads {
                main: true,
                companion: false,
                lexicon: false,
            }
        );
    }

    #[test]
    fn the_shared_lexicon_is_reported_as_the_last_of_the_files() {
        let lexicon = kitten().shared_lexicon().expect("lexicon");
        let event = progress_event(
            kitten(),
            lexicon.file_name,
            (1, 2),
            TransferProgress {
                received: 1,
                total: Some(lexicon.size_bytes),
                speed_bps: 0,
            },
        );
        assert_eq!(event.file_name, "lexicon-en-us.txt");
        assert_eq!(event.total, 6_305_773);
    }

    #[test]
    fn a_shared_file_is_fetched_only_when_it_is_missing_or_the_wrong_size() {
        assert!(needs_fetch(None, 6_305_773), "missing");
        assert!(needs_fetch(Some(5), 6_305_773), "a partial-sized file");
        assert!(
            !needs_fetch(Some(6_305_773), 6_305_773),
            "complete after another model waited for the lock: skip"
        );
    }

    #[tokio::test]
    async fn a_model_waiting_for_the_shared_lock_stops_when_cancelled() {
        // One test holds and then frees the lock, so no other test contends for it.
        let held = SHARED_FILE_LOCK.lock().await;
        let cancel = AtomicBool::new(true);
        assert!(wait_for_shared_lock(&cancel).await.is_none());
        drop(held);
        cancel.store(false, std::sync::atomic::Ordering::SeqCst);
        assert!(wait_for_shared_lock(&cancel).await.is_some());
    }

    #[tokio::test]
    async fn a_single_file_is_renamed_into_place_when_its_size_matches() {
        let scratch = Scratch::new("speech-single-file");
        let recipe = speech_catalog::find_recipe("gtcrn-simple").expect("recipe");
        let target = scratch.path().join("gtcrn_simple.onnx");
        let partial = partial_path(&target);
        std::fs::write(&partial, vec![0u8; recipe.size_bytes as usize]).expect("partial");

        check_size_and_finish(
            &partial,
            &target,
            recipe.asset_name(),
            recipe.size_bytes,
            recipe.size_bytes,
        )
        .await
        .expect("right size");

        assert!(target.is_file());
        assert!(!partial.exists());
    }

    #[tokio::test]
    async fn a_file_of_the_wrong_size_is_deleted_and_not_kept() {
        let scratch = Scratch::new("speech-wrong-size");
        let recipe = speech_catalog::find_recipe("gtcrn-simple").expect("recipe");
        let target = scratch.path().join("gtcrn_simple.onnx");
        let partial = partial_path(&target);
        std::fs::write(&partial, b"short").expect("partial");

        let error =
            check_size_and_finish(&partial, &target, recipe.asset_name(), recipe.size_bytes, 5)
                .await
                .expect_err("wrong size");

        assert!(error.contains("gtcrn_simple.onnx is 5 bytes"), "{error}");
        assert!(!partial.exists());
        assert!(!target.exists());
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
