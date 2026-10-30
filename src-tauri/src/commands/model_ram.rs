//! RAM estimate for each downloaded model, for the model selector and the load check. The files are
//! read here; the arithmetic lives in `ram_estimate`.

use std::path::Path;

use serde::Serialize;

use super::capabilities::{self, CachedFile, FolderFiles};
use super::models::{self, GeniexListModel};
use crate::gguf;
use crate::ram_estimate::{self, RamEstimate};

/// One downloaded model at one precision, with its RAM estimate in bytes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRamEstimate {
    /// The model's GenieX name (`org/repo`).
    pub name: String,
    /// Precision label from `geniex list`; empty when the listing names none.
    pub precision: String,
    pub weights_bytes: u64,
    /// KV cache for the context window. Zero for a QAIRT bundle, whose context is baked in.
    pub kv_bytes: u64,
    /// Compute buffers, plus the vision projector when the model has one.
    pub extra_bytes: u64,
    pub total_bytes: u64,
    /// True when the estimate used a flat factor, or the model's files could not be measured.
    pub approximate: bool,
}

/// RAM each downloaded model needs once loaded. `nctx` sets the context for every model; `None`
/// uses each model's native context, capped at 8192.
#[tauri::command]
pub async fn model_ram_estimates(nctx: Option<i32>) -> Result<Vec<ModelRamEstimate>, String> {
    let requested = ram_estimate::requested_context(nctx)?;
    let listed = models::geniex_list().await?;
    tokio::task::spawn_blocking(move || {
        listed
            .iter()
            .flat_map(|model| estimates_for_model(model, requested))
            .collect()
    })
    .await
    .map_err(|e| format!("RAM estimate failed: {e}"))
}

/// Estimates for each precision of one model listed by `geniex list`.
fn estimates_for_model(model: &GeniexListModel, requested: Option<u64>) -> Vec<ModelRamEstimate> {
    // A name that is not a valid cache path has no files here, so its estimate is zero and approximate.
    let folder = capabilities::model_folder(&model.name).unwrap_or_default();
    estimates_for_folder(&model.name, &folder, &precisions_of(model), requested)
}

/// Estimates for each precision of the model whose files are in `folder`.
fn estimates_for_folder(
    name: &str,
    folder: &Path,
    precisions: &[String],
    requested: Option<u64>,
) -> Vec<ModelRamEstimate> {
    let files = capabilities::scan_folder(folder);
    precisions
        .iter()
        .map(|precision| {
            let estimate = estimate_for_precision(&files, folder, precision, requested);
            to_row(name, precision, estimate)
        })
        .collect()
}

/// The estimate for one precision: GGUF weights when the folder has them, else the bundle's size.
fn estimate_for_precision(
    files: &FolderFiles,
    folder: &Path,
    precision: &str,
    requested: Option<u64>,
) -> RamEstimate {
    let Some(weights) = weights_for_precision(&files.weights, precision) else {
        return ram_estimate::qairt_estimate(folder_bytes(folder));
    };
    let projector_bytes = files
        .projector
        .as_ref()
        .map_or(0, |projector| projector.size);
    // An unreadable header leaves the KV cache unknown, so the estimate falls back to a flat factor.
    let header = gguf::read_header(&weights.path).ok();
    let native_context = header.as_ref().and_then(|header| header.context_length);
    let context = ram_estimate::context_for_estimate(requested, native_context);
    let kv_bytes = header
        .as_ref()
        .and_then(|header| header.kv_cache_bytes(context));
    ram_estimate::gguf_estimate(weights.size, projector_bytes, kv_bytes)
}

/// The weights file for `precision`: the largest whose name carries it, else the largest file.
fn weights_for_precision<'a>(weights: &'a [CachedFile], precision: &str) -> Option<&'a CachedFile> {
    weights
        .iter()
        .find(|file| ram_estimate::file_name_has_precision(&file.name, precision))
        .or_else(|| weights.first())
}

/// Total size of the regular files directly in `folder`, the size of a bundle with no GGUF weights.
/// Zero when the folder cannot be read.
fn folder_bytes(folder: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|entry| entry.metadata().ok())
        .filter(|meta| meta.is_file())
        .fold(0_u64, |sum, meta| sum.saturating_add(meta.len()))
}

/// The precisions `geniex list` names, or one unnamed row when it names none.
fn precisions_of(model: &GeniexListModel) -> Vec<String> {
    match model.precisions.as_deref() {
        Some(list) if !list.is_empty() => list.to_vec(),
        _ => vec![String::new()],
    }
}

fn to_row(name: &str, precision: &str, estimate: RamEstimate) -> ModelRamEstimate {
    ModelRamEstimate {
        name: name.to_string(),
        precision: precision.to_string(),
        weights_bytes: estimate.weights_bytes,
        kv_bytes: estimate.kv_bytes,
        extra_bytes: estimate.extra_bytes,
        total_bytes: estimate.total_bytes,
        approximate: estimate.approximate,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gguf::test_support::{build_header, kv_string, kv_u32};

    const MIB: u64 = 1024 * 1024;

    /// A fresh folder under the temp dir, unique per test.
    fn fresh_folder(tag: &str) -> std::path::PathBuf {
        let folder = std::env::temp_dir().join(format!("localgenie-ram-{tag}"));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("create temp model folder");
        folder
    }

    /// Write `head` padded with zeros to `len` bytes. The header reader never reads past the metadata,
    /// so the padding stands in for tensor data.
    fn write_padded(folder: &Path, name: &str, head: &[u8], len: usize) {
        let mut bytes = head.to_vec();
        bytes.resize(len, 0);
        std::fs::write(folder.join(name), bytes).expect("write model file");
    }

    /// A llama header: 2 layers, 2 KV heads of 16 + 16 elements at 2 bytes, so 256 bytes per token.
    fn llama_header() -> Vec<u8> {
        build_header(&[
            kv_string("general.architecture", "llama"),
            kv_u32("llama.block_count", 2),
            kv_u32("llama.embedding_length", 64),
            kv_u32("llama.attention.head_count", 4),
            kv_u32("llama.attention.head_count_kv", 2),
        ])
    }

    fn projector_header() -> Vec<u8> {
        build_header(&[kv_string("general.architecture", "clip")])
    }

    fn precisions(list: &[&str]) -> Vec<String> {
        list.iter().map(|p| p.to_string()).collect()
    }

    #[test]
    fn each_precision_gets_its_own_weights_file_and_the_projector() {
        let folder = fresh_folder("precisions");
        write_padded(&folder, "model-Q4_0.gguf", &llama_header(), 2000);
        write_padded(&folder, "model-Q8_0.gguf", &llama_header(), 5000);
        write_padded(&folder, "mmproj-model.gguf", &projector_header(), 300);

        let got = estimates_for_folder("org/model", &folder, &precisions(&["Q4_0", "Q8_0"]), None);
        let _ = std::fs::remove_dir_all(&folder);

        // No context in the header, so the 4096 fallback sizes the cache: 256 bytes x 4096.
        let kv = 256 * 4096;
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].precision, "Q4_0");
        assert_eq!(got[0].weights_bytes, 2000);
        assert_eq!(got[0].kv_bytes, kv);
        assert_eq!(got[0].extra_bytes, 256 * MIB + 300);
        assert_eq!(got[0].total_bytes, 2000 + kv + 256 * MIB + 300);
        assert!(!got[0].approximate);
        assert_eq!(got[1].precision, "Q8_0");
        assert_eq!(got[1].weights_bytes, 5000);
    }

    #[test]
    fn a_requested_context_sizes_the_kv_cache() {
        let folder = fresh_folder("requested");
        write_padded(&folder, "model-Q4_0.gguf", &llama_header(), 2000);

        let got = estimates_for_folder("org/model", &folder, &precisions(&["Q4_0"]), Some(1000));
        let _ = std::fs::remove_dir_all(&folder);

        assert_eq!(got[0].kv_bytes, 256 * 1000);
        assert!(!got[0].approximate);
    }

    #[test]
    fn an_unreadable_gguf_uses_the_flat_factor_and_is_approximate() {
        let folder = fresh_folder("unreadable");
        write_padded(&folder, "broken.gguf", b"NOPE", 1000);

        let got = estimates_for_folder("org/broken", &folder, &precisions(&[""]), None);
        let _ = std::fs::remove_dir_all(&folder);

        assert_eq!(got[0].precision, "");
        assert_eq!(got[0].weights_bytes, 1000);
        assert_eq!(got[0].kv_bytes, 0);
        assert_eq!(got[0].extra_bytes, 200);
        assert_eq!(got[0].total_bytes, 1200);
        assert!(got[0].approximate);
    }

    #[test]
    fn a_folder_without_gguf_is_a_bundle_with_no_kv_cache() {
        let folder = fresh_folder("bundle");
        write_padded(&folder, "genie_config.json", b"{}", 100);
        write_padded(&folder, "weights.raw", b"raw", 900);

        let got = estimates_for_folder("qualcomm/Model", &folder, &precisions(&["w4a16"]), None);
        let _ = std::fs::remove_dir_all(&folder);

        assert_eq!(got[0].weights_bytes, 1000);
        assert_eq!(got[0].kv_bytes, 0);
        assert_eq!(got[0].extra_bytes, 100);
        assert_eq!(got[0].total_bytes, 1100);
        assert!(!got[0].approximate);
    }

    #[test]
    fn a_missing_folder_is_zero_and_approximate() {
        let folder = std::env::temp_dir().join("localgenie-ram-does-not-exist");
        let _ = std::fs::remove_dir_all(&folder);

        let got = estimates_for_folder("org/gone", &folder, &precisions(&[""]), None);

        assert_eq!(got[0].total_bytes, 0);
        assert!(got[0].approximate);
    }

    #[test]
    fn a_model_with_no_listed_precision_gets_one_unnamed_row() {
        assert_eq!(precisions_of(&listed(None)), vec![String::new()]);
        assert_eq!(precisions_of(&listed(Some(vec![]))), vec![String::new()]);
        assert_eq!(
            precisions_of(&listed(Some(vec!["Q4_0".into()]))),
            vec!["Q4_0".to_string()]
        );
    }

    fn listed(precisions: Option<Vec<String>>) -> GeniexListModel {
        GeniexListModel {
            name: "org/model".into(),
            size: None,
            precisions,
        }
    }
}
