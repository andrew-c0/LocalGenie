//! RAM a downloaded model needs once loaded, computed from its files when its row is stored. The files
//! are read here; the arithmetic lives in `ram_estimate`.

use std::path::Path;

use super::capabilities::{self, CachedFile, FolderFiles};
use crate::gguf;
use crate::ram_estimate::{self, RamEstimate};

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
    // The header's native context also caps a requested one.
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

/// The RAM a downloaded model needs, as the columns stored on its `downloaded_models` row.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct StoredRam {
    /// Weights, compute buffers and projector. Does not depend on the context window.
    pub(super) base_bytes: u64,
    /// KV cache for the context window. Zero for a QAIRT bundle.
    pub(super) context_bytes: u64,
    /// True when a flat factor stood in for the cache, or the model's files could not be measured.
    pub(super) approximate: bool,
}

impl StoredRam {
    fn from_estimate(estimate: RamEstimate) -> Self {
        Self {
            base_bytes: estimate.weights_bytes.saturating_add(estimate.extra_bytes),
            context_bytes: estimate.kv_bytes,
            approximate: estimate.approximate,
        }
    }
}

/// The stored RAM for one precision of the model whose files are in `folder`. `requested` is the
/// saved context window (`None` for the default). The folder listing and the weights' header are
/// each read once.
pub(super) fn stored_ram_for(folder: &Path, precision: &str, requested: Option<u64>) -> StoredRam {
    let files = capabilities::scan_folder(folder);
    StoredRam::from_estimate(estimate_for_precision(&files, folder, precision, requested))
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
        build_header(&llama_entries())
    }

    /// The llama header with a native context length of `context` tokens.
    fn llama_header_with_context(context: u32) -> Vec<u8> {
        let mut entries = llama_entries();
        entries.push(kv_u32("llama.context_length", context));
        build_header(&entries)
    }

    fn llama_entries() -> Vec<Vec<u8>> {
        vec![
            kv_string("general.architecture", "llama"),
            kv_u32("llama.block_count", 2),
            kv_u32("llama.embedding_length", 64),
            kv_u32("llama.attention.head_count", 4),
            kv_u32("llama.attention.head_count_kv", 2),
        ]
    }

    fn projector_header() -> Vec<u8> {
        build_header(&[kv_string("general.architecture", "clip")])
    }

    #[test]
    fn each_precision_gets_its_own_weights_file() {
        let folder = fresh_folder("stored-precisions");
        write_padded(&folder, "model-Q4_0.gguf", &llama_header(), 2000);
        write_padded(&folder, "model-Q8_0.gguf", &llama_header(), 5000);

        let q4 = stored_ram_for(&folder, "Q4_0", None);
        let q8 = stored_ram_for(&folder, "Q8_0", None);
        let _ = std::fs::remove_dir_all(&folder);

        // Both sizes sit under the 256 MiB compute-buffer floor, so the bases differ by the weights alone.
        assert_eq!(q4.base_bytes, 2000 + 256 * MIB);
        assert_eq!(q8.base_bytes, 5000 + 256 * MIB);
        assert_eq!(q4.context_bytes, q8.context_bytes);
        assert!(!q4.approximate);
        assert!(!q8.approximate);
    }

    #[test]
    fn stored_ram_splits_base_from_the_default_context() {
        let folder = fresh_folder("stored-default");
        write_padded(&folder, "model-Q4_0.gguf", &llama_header(), 2000);
        write_padded(&folder, "mmproj-model.gguf", &projector_header(), 300);

        let got = stored_ram_for(&folder, "Q4_0", None);
        let _ = std::fs::remove_dir_all(&folder);

        // Base is weights + compute buffers (256 MiB floor) + projector. Context is 256 x 4096.
        assert_eq!(got.base_bytes, 2000 + 256 * MIB + 300);
        assert_eq!(got.context_bytes, 256 * 4096);
        assert!(!got.approximate);
    }

    #[test]
    fn stored_ram_context_follows_the_saved_window() {
        let folder = fresh_folder("stored-requested");
        write_padded(
            &folder,
            "model-Q4_0.gguf",
            &llama_header_with_context(512),
            2000,
        );

        // The model's native context is 512, so a 1000-token window is capped there.
        let capped = stored_ram_for(&folder, "Q4_0", Some(1000));
        let smaller = stored_ram_for(&folder, "Q4_0", Some(256));
        let _ = std::fs::remove_dir_all(&folder);

        assert_eq!(capped.context_bytes, 256 * 512);
        assert_eq!(smaller.context_bytes, 256 * 256);
        assert_eq!(capped.base_bytes, smaller.base_bytes);
    }

    #[test]
    fn stored_ram_of_an_unreadable_gguf_is_flat_and_has_no_context() {
        let folder = fresh_folder("stored-flat");
        write_padded(&folder, "broken.gguf", b"NOPE", 1000);

        let got = stored_ram_for(&folder, "", None);
        let _ = std::fs::remove_dir_all(&folder);

        assert_eq!(got.base_bytes, 1200);
        assert_eq!(got.context_bytes, 0);
        assert!(got.approximate);
    }

    #[test]
    fn stored_ram_of_a_bundle_has_no_context() {
        let folder = fresh_folder("stored-bundle");
        write_padded(&folder, "genie_config.json", b"{}", 100);
        write_padded(&folder, "weights.raw", b"raw", 900);

        let got = stored_ram_for(&folder, "w4a16", Some(4096));
        let _ = std::fs::remove_dir_all(&folder);

        // 1000 bytes of bundle plus a tenth.
        assert_eq!(got.base_bytes, 1100);
        assert_eq!(got.context_bytes, 0);
        assert!(!got.approximate);
    }

    #[test]
    fn stored_ram_of_a_missing_folder_is_zero_and_approximate() {
        let folder = std::env::temp_dir().join("localgenie-ram-stored-missing");
        let _ = std::fs::remove_dir_all(&folder);

        let got = stored_ram_for(&folder, "", None);

        assert_eq!(got.base_bytes, 0);
        assert_eq!(got.context_bytes, 0);
        assert!(got.approximate);
    }
}
