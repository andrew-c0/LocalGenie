//! Downloads an OCR model's two files into its folder under Downloads, then imports them into
//! GenieX like a Models tab download, so the model shows in both places. The projector comes first.
//! A cancelled download keeps its `.part` file for a resume.

use std::sync::atomic::AtomicBool;

use sea_orm::DatabaseConnection;
use tauri::AppHandle;

use super::model_download::{fetch_to_folder, DownloadEnd, FilePosition, FileSource};
use super::ocr_catalog::OcrRecipe;
use crate::commands::download::download_dir;
use crate::commands::import::{import_gguf_files, GgufImport};

/// One run of an OCR model's download and import.
pub(super) struct OcrDownload<'a> {
    pub app: &'a AppHandle,
    /// The download client, which has no total timeout.
    pub download_client: &'a reqwest::Client,
    /// The client for the model card request of the import.
    pub http_client: &'a reqwest::Client,
    pub db: &'a DatabaseConnection,
    pub cancel: &'a AtomicBool,
}

impl OcrDownload<'_> {
    /// Download the files that are not on disk, then import them. Stops before the import when
    /// cancelled. A failed import keeps the files, so a retry does not download again.
    pub(super) async fn run(&self, recipe: &OcrRecipe) -> Result<DownloadEnd, String> {
        let folder_name = recipe.folder();
        let folder = download_dir()
            .ok_or("Could not resolve a downloads directory")?
            .join(&folder_name);
        let files = recipe.files_in_order();
        for (index, file) in files.iter().enumerate() {
            if folder.join(file.name).is_file() {
                continue;
            }
            let position = FilePosition {
                model_id: recipe.id,
                index,
                count: files.len(),
            };
            let source = FileSource {
                url: recipe.file_url(file),
                name: file.name,
                size_bytes: file.size_bytes,
                folder: &folder,
            };
            let end = fetch_to_folder(
                self.app,
                self.download_client,
                self.cancel,
                position,
                &source,
            )
            .await?;
            if end == DownloadEnd::Cancelled {
                return Ok(DownloadEnd::Cancelled);
            }
        }
        import_gguf_files(
            self.app,
            self.http_client,
            self.db,
            GgufImport {
                folder: &folder_name,
                repo_id: recipe.repo,
                filename: recipe.model.name,
                precision: recipe.precision,
                sidecar_names: &[recipe.projector.name.to_string()],
                facets: None,
            },
        )
        .await?;
        Ok(DownloadEnd::Finished)
    }
}
