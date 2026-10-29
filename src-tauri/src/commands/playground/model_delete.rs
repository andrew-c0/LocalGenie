//! Deletes a curated model's files from the models folder. A file that another downloaded model also
//! needs, such as the Qwen3 text encoder, is kept. The model's partial downloads go too. Every path
//! is checked to be inside the models folder before any file is removed.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::catalog::{self, ImageRecipe, RECIPES};
use super::paths;

/// What `playground_delete_model` returns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDeletion {
    pub freed_bytes: u64,
}

/// A file that will be removed, with its size.
#[derive(Debug, PartialEq, Eq)]
struct FileToDelete {
    path: PathBuf,
    bytes: u64,
}

/// The files of `recipe` that may be deleted: each one that no other downloaded model needs.
/// A model is downloaded when every one of its files is on disk.
pub(super) fn removable_files(recipe: &ImageRecipe, models_root: &Path) -> Vec<PathBuf> {
    let needed_by_others: HashSet<PathBuf> = RECIPES
        .iter()
        .filter(|other| other.id != recipe.id && catalog::is_downloaded(other, models_root))
        .flat_map(|other| {
            other
                .files
                .iter()
                .map(|file| catalog::local_path(models_root, file))
        })
        .collect();
    recipe
        .files
        .iter()
        .map(|file| catalog::local_path(models_root, file))
        .filter(|path| !needed_by_others.contains(path))
        .collect()
}

/// Delete the removable files of `recipe`, their partial downloads, and the folders left empty.
/// Returns the bytes freed. Nothing is deleted when any path is outside `models_root`.
pub(super) async fn delete_model_files(
    models_root: &Path,
    recipe: &ImageRecipe,
) -> Result<ModelDeletion, String> {
    let files = removable_files(recipe, models_root);
    let to_delete = plan_deletion(models_root, &files)?;
    for file in &to_delete {
        tokio::fs::remove_file(&file.path)
            .await
            .map_err(|e| format!("Failed to delete {}: {e}", file.path.display()))?;
    }
    remove_empty_folders(models_root, &files).await;
    Ok(ModelDeletion {
        freed_bytes: to_delete.iter().map(|file| file.bytes).sum(),
    })
}

/// The files to remove for `files`: each one, and its partial download, when it is on disk.
fn plan_deletion(models_root: &Path, files: &[PathBuf]) -> Result<Vec<FileToDelete>, String> {
    let mut to_delete = Vec::new();
    for file in files {
        to_delete.extend(file_to_delete_at(&partial_path(file), models_root)?);
        to_delete.extend(file_to_delete_at(file, models_root)?);
    }
    Ok(to_delete)
}

/// The file at `path` as a deletion, or None when there is no file there. A path outside
/// `models_root`, including through a symbolic link, is an error.
fn file_to_delete_at(path: &Path, models_root: &Path) -> Result<Option<FileToDelete>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let inside = paths::contained_path(path, models_root)?;
    let bytes = std::fs::metadata(&inside)
        .map_err(|e| format!("Cannot read {}: {e}", path.display()))?
        .len();
    Ok(Some(FileToDelete {
        path: path.to_path_buf(),
        bytes,
    }))
}

/// The partial download of `file`: the same path with `.part` added, as the downloader writes it.
pub(super) fn partial_path(file: &Path) -> PathBuf {
    let mut name = file.as_os_str().to_os_string();
    name.push(".part");
    PathBuf::from(name)
}

/// Remove the folder of each file when it is empty now. `remove_dir` only removes an empty folder,
/// so a folder another model still uses stays. The models folder itself is never removed.
async fn remove_empty_folders(models_root: &Path, files: &[PathBuf]) {
    for folder in files.iter().filter_map(|file| file.parent()) {
        if folder != models_root && folder.starts_with(models_root) {
            let _ = tokio::fs::remove_dir(folder).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::catalog::{find_recipe, ModelRole};
    use super::super::test_support::{try_file_link, Scratch};
    use super::*;

    const FLUX: &str = "flux2-klein-4b-q4";
    const Z_IMAGE: &str = "z-image-turbo-q4";

    /// The local path of `role` in the recipe `id`.
    fn path_of(id: &str, role: ModelRole, models_root: &Path) -> PathBuf {
        find_recipe(id)
            .expect("recipe")
            .local_paths(models_root)
            .into_iter()
            .find(|(path_role, _)| *path_role == role)
            .map(|(_, path)| path)
            .expect("path for role")
    }

    /// Write every file of the recipe `id` with the same ten bytes, so it counts as downloaded.
    fn write_model(id: &str, models_root: &Path) {
        let recipe = find_recipe(id).expect("recipe");
        for file in recipe.files {
            let path = catalog::local_path(models_root, file);
            std::fs::create_dir_all(path.parent().expect("parent")).expect("folder");
            std::fs::write(&path, b"0123456789").expect("file");
        }
    }

    /// The folder a model's files live in, for asserting it is removed or kept.
    fn model_folder(id: &str, models_root: &Path) -> PathBuf {
        let recipe = find_recipe(id).expect("recipe");
        catalog::local_dir(models_root, &recipe.files[0])
    }

    #[test]
    fn partial_path_adds_part_to_the_name() {
        assert_eq!(
            partial_path(Path::new("models/repo/a.gguf")),
            PathBuf::from("models/repo/a.gguf.part")
        );
    }

    #[test]
    fn a_file_another_downloaded_model_needs_is_kept() {
        let scratch = Scratch::new("delete-kept");
        let root = scratch.path().join("playground-models");
        write_model(Z_IMAGE, &root);

        let removable = removable_files(find_recipe(FLUX).expect("flux"), &root);
        let llm = path_of(FLUX, ModelRole::Llm, &root);
        assert!(!removable.contains(&llm), "the shared text encoder is kept");
        assert!(removable.contains(&path_of(FLUX, ModelRole::Model, &root)));
        assert!(removable.contains(&path_of(FLUX, ModelRole::Vae, &root)));
    }

    #[test]
    fn a_shared_file_is_removable_when_no_other_model_is_fully_downloaded() {
        let scratch = Scratch::new("delete-removable");
        let root = scratch.path().join("playground-models");
        write_model(FLUX, &root);
        // Z-Image is not downloaded: its own files are missing, so it does not need the shared one.
        let removable = removable_files(find_recipe(FLUX).expect("flux"), &root);
        assert_eq!(removable.len(), 3, "every file of FLUX goes");
        assert!(removable.contains(&path_of(FLUX, ModelRole::Llm, &root)));
    }

    #[tokio::test]
    async fn deleting_keeps_the_shared_text_encoder_while_the_other_model_is_downloaded() {
        let scratch = Scratch::new("delete-shared-kept");
        let root = scratch.path().join("playground-models");
        write_model(FLUX, &root);
        write_model(Z_IMAGE, &root);
        // A stale partial of FLUX's own diffusion model, 5 bytes.
        let partial = partial_path(&path_of(FLUX, ModelRole::Model, &root));
        std::fs::write(&partial, b"xxxxx").expect("partial");

        let deletion = delete_model_files(&root, find_recipe(FLUX).expect("flux"))
            .await
            .expect("delete");

        // Diffusion model (10) and VAE (10) plus the partial (5); the text encoder (10) stays.
        assert_eq!(deletion.freed_bytes, 25);
        assert!(!path_of(FLUX, ModelRole::Model, &root).exists());
        assert!(!path_of(FLUX, ModelRole::Vae, &root).exists());
        assert!(!partial.exists());
        assert!(path_of(FLUX, ModelRole::Llm, &root).is_file());
        assert!(path_of(Z_IMAGE, ModelRole::Model, &root).is_file());
        assert!(
            !model_folder(FLUX, &root).exists(),
            "the empty FLUX folder goes"
        );
        assert!(
            model_folder(Z_IMAGE, &root).is_dir(),
            "the shared folder stays"
        );
    }

    #[tokio::test]
    async fn deleting_the_last_model_that_uses_a_file_removes_it_and_its_folder() {
        let scratch = Scratch::new("delete-shared-removed");
        let root = scratch.path().join("playground-models");
        write_model(FLUX, &root);

        let deletion = delete_model_files(&root, find_recipe(FLUX).expect("flux"))
            .await
            .expect("delete");

        assert_eq!(deletion.freed_bytes, 30);
        for role in [ModelRole::Model, ModelRole::Vae, ModelRole::Llm] {
            assert!(!path_of(FLUX, role, &root).exists(), "{role:?}");
        }
        assert!(!model_folder(FLUX, &root).exists());
        let shared_folder = path_of(FLUX, ModelRole::Llm, &root)
            .parent()
            .expect("folder")
            .to_path_buf();
        assert!(
            !shared_folder.exists(),
            "the shared folder is empty and goes"
        );
        assert!(root.is_dir(), "the models folder itself stays");
    }

    #[tokio::test]
    async fn a_model_with_nothing_on_disk_frees_nothing_and_is_not_an_error() {
        let scratch = Scratch::new("delete-nothing");
        let root = scratch.path().join("playground-models");
        let deletion = delete_model_files(&root, find_recipe(FLUX).expect("flux"))
            .await
            .expect("delete");
        assert_eq!(deletion, ModelDeletion { freed_bytes: 0 });
    }

    #[tokio::test]
    async fn a_file_that_links_out_of_the_models_folder_stops_the_delete_before_anything_goes() {
        let scratch = Scratch::new("delete-escape");
        let root = scratch.path().join("playground-models");
        write_model(FLUX, &root);
        let outside = scratch.path().join("outside.gguf");
        std::fs::write(&outside, b"keep me").expect("outside");
        let model = path_of(FLUX, ModelRole::Model, &root);
        std::fs::remove_file(&model).expect("replace the model file");
        if !try_file_link(&outside, &model) {
            return;
        }

        let outcome = delete_model_files(&root, find_recipe(FLUX).expect("flux")).await;

        assert!(outcome.is_err());
        assert!(
            outside.is_file(),
            "the file outside the folder is untouched"
        );
        assert!(
            path_of(FLUX, ModelRole::Vae, &root).is_file(),
            "nothing else was removed"
        );
    }
}
