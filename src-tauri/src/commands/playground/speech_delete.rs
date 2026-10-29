//! Deletes a speech model's folder, its archive and its partial download. Each speech model has its
//! own folder, so nothing else is kept. Every path is checked to be inside the models folder before
//! anything is removed, and the walk runs on a blocking thread.

use std::path::{Path, PathBuf};

use super::model_delete::{partial_path, ModelDeletion};
use super::paths;
use super::speech_catalog::{self, SpeechRecipe};

/// Delete the files of `recipe` under `models_root` and return the bytes freed. Nothing is removed
/// when any path is outside `models_root`.
pub(super) async fn delete_speech_model_files(
    models_root: &Path,
    recipe: &SpeechRecipe,
) -> Result<ModelDeletion, String> {
    let root: PathBuf = models_root.to_path_buf();
    let recipe = *recipe;
    tokio::task::spawn_blocking(move || delete_files(&root, &recipe))
        .await
        .map_err(|e| format!("Deleting the model stopped: {e}"))?
}

fn delete_files(models_root: &Path, recipe: &SpeechRecipe) -> Result<ModelDeletion, String> {
    let archive = speech_catalog::archive_path(models_root, recipe);
    let partial = partial_path(&archive);
    let folder = speech_catalog::model_dir(models_root, recipe);

    let mut freed_bytes = 0;
    for file in [archive, partial] {
        freed_bytes += remove_file_if_present(&file, models_root)?;
    }
    if folder.exists() {
        let inside = paths::contained_path(&folder, models_root)?;
        freed_bytes += tree_bytes(&inside);
        std::fs::remove_dir_all(&inside)
            .map_err(|e| format!("Failed to delete {}: {e}", folder.display()))?;
    }
    Ok(ModelDeletion { freed_bytes })
}

/// Remove `file` when it is there, after checking it is inside `models_root`. Returns the bytes
/// removed, 0 when there was no file.
fn remove_file_if_present(file: &Path, models_root: &Path) -> Result<u64, String> {
    if !file.is_file() {
        return Ok(0);
    }
    let inside = paths::contained_path(file, models_root)?;
    let bytes = std::fs::metadata(&inside)
        .map_err(|e| format!("Cannot read {}: {e}", file.display()))?
        .len();
    std::fs::remove_file(&inside)
        .map_err(|e| format!("Failed to delete {}: {e}", file.display()))?;
    Ok(bytes)
}

/// The bytes of every file under `path`. Files that cannot be read count as 0.
fn tree_bytes(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|entry| {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                tree_bytes(&entry_path)
            } else {
                entry.metadata().map(|meta| meta.len()).unwrap_or(0)
            }
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::super::test_support::Scratch;
    use super::*;

    /// Write every entry of `recipe` with the same ten bytes, as a finished unpack would.
    fn write_model(recipe: &SpeechRecipe, models_root: &Path) {
        let folder = speech_catalog::model_dir(models_root, recipe);
        std::fs::create_dir_all(&folder).expect("folder");
        for entry in recipe.engine.entries() {
            std::fs::write(folder.join(entry), b"0123456789").expect("entry");
        }
    }

    #[tokio::test]
    async fn deleting_a_model_frees_its_folder_archive_and_partial() {
        let scratch = Scratch::new("speech-delete");
        let root = scratch.path().join("playground-models");
        let recipe = speech_catalog::find_recipe("whisper-tiny-en").expect("recipe");
        write_model(recipe, &root);
        let archive = speech_catalog::archive_path(&root, recipe);
        std::fs::write(&archive, b"0123456789").expect("archive");
        std::fs::write(partial_path(&archive), b"01234").expect("partial");
        let other = speech_catalog::find_recipe("moonshine-base-en").expect("other");
        write_model(other, &root);

        let deletion = delete_speech_model_files(&root, recipe)
            .await
            .expect("delete");

        // Three model files of 10 bytes, the archive of 10 bytes, and the partial of 5 bytes.
        assert_eq!(deletion.freed_bytes, 45);
        assert!(!speech_catalog::model_dir(&root, recipe).exists());
        assert!(!archive.exists());
        assert!(!partial_path(&archive).exists());
        assert!(
            speech_catalog::is_downloaded(other, &root),
            "another speech model is kept"
        );
    }

    #[tokio::test]
    async fn a_model_with_nothing_on_disk_frees_nothing() {
        let scratch = Scratch::new("speech-delete-nothing");
        let recipe = speech_catalog::find_recipe("kokoro-int8-multi-v1").expect("recipe");
        let deletion = delete_speech_model_files(&scratch.path().join("models"), recipe)
            .await
            .expect("delete");
        assert_eq!(deletion, ModelDeletion { freed_bytes: 0 });
    }

    #[test]
    fn tree_bytes_adds_up_nested_files() {
        let scratch = Scratch::new("speech-tree");
        let nested = scratch.path().join("dict").join("pos");
        std::fs::create_dir_all(&nested).expect("dirs");
        std::fs::write(scratch.path().join("a.txt"), b"123").expect("a");
        std::fs::write(nested.join("b.txt"), b"4567").expect("b");
        assert_eq!(tree_bytes(scratch.path()), 7);
        assert_eq!(tree_bytes(&scratch.path().join("missing")), 0);
    }
}
