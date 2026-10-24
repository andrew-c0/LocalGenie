//! Capability summary for a downloaded model: engine, context length, quantisation, projector
//! presence and heuristic hints. Read from the GGUF headers in the model's GenieX cache folder.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

use serde::Serialize;

use super::models::derive_source;
use crate::gguf::{self, GgufHeader};

/// What the model settings screen shows. A field is `null` when the file does not say.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilities {
    /// `qairt` for Qualcomm AI Hub bundles, `llama_cpp` for GGUF models.
    pub engine: String,
    pub context_length: Option<i64>,
    pub architecture: Option<String>,
    pub quantisation: Option<String>,
    /// A `mmproj` GGUF sits next to the weights.
    pub has_vision_projector: bool,
    /// From `clip.has_audio_encoder` in the projector. `None` when there is no readable projector.
    pub has_audio_encoder: Option<bool>,
    /// Heuristic from the chat template. `None` when there is no template.
    pub thinking_hint: Option<bool>,
    /// Heuristic from the chat template. `None` when there is no template.
    pub tool_call_hint: Option<bool>,
}

/// Summary for one model, looked up by its GenieX name (`org/repo`, optionally `:precision`).
#[tauri::command]
pub async fn get_model_capabilities(model_name: String) -> Result<ModelCapabilities, String> {
    summary_for(&model_name).await
}

/// Memory the KV cache reserves for `n_ctx` tokens, computed from the model's GGUF header.
/// `None` when the model has no GGUF weights or the header lacks the attention sizes.
#[tauri::command]
pub async fn get_context_memory(model_name: String, n_ctx: u64) -> Result<Option<u64>, String> {
    let folder = model_folder(&model_name)?;
    tokio::task::spawn_blocking(move || {
        let Some(main) = scan_folder(&folder).main else {
            return Ok(None);
        };
        Ok(gguf::read_header(&main.path)?.kv_cache_bytes(n_ctx))
    })
    .await
    .map_err(|e| format!("Context memory read failed: {e}"))?
}

/// Summary for a model name. The settings scan reads the template hints from the same summary.
pub(super) async fn summary_for(model_name: &str) -> Result<ModelCapabilities, String> {
    let folder = model_folder(model_name)?;
    let engine = if derive_source(model_name) == "aihub" {
        "qairt"
    } else {
        "llama_cpp"
    };
    tokio::task::spawn_blocking(move || summarise(&folder, engine))
        .await
        .map_err(|e| format!("Capability read failed: {e}"))?
}

/// GenieX model cache root: `<GENIEX_DATADIR>/models` when set, else `~/.cache/geniex/models`.
fn models_root() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("GENIEX_DATADIR").filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(dir).join("models"));
    }
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(
        PathBuf::from(home)
            .join(".cache")
            .join("geniex")
            .join("models"),
    )
}

/// Folder of a cached model. The `:precision` suffix is dropped, and any name that could leave
/// the cache root is refused.
pub(super) fn model_folder(model_name: &str) -> Result<PathBuf, String> {
    // The precision colon can only sit in the last path part, so a drive letter is not mistaken for it.
    let last_part = model_name.rfind('/').map_or(0, |i| i + 1);
    let name = match model_name[last_part..].rfind(':') {
        Some(colon) => &model_name[..last_part + colon],
        None => model_name,
    };
    let parts: Vec<&str> = name.split('/').collect();
    let valid = parts.iter().all(|part| {
        !part.is_empty() && *part != "." && *part != ".." && !part.contains(['\\', ':'])
    });
    if !valid {
        return Err(format!("Invalid model name: {model_name}"));
    }
    let mut dir = models_root().ok_or("Could not resolve the GenieX model cache folder")?;
    for part in parts {
        dir.push(part);
    }
    Ok(dir)
}

/// One GGUF file in a model folder.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct CachedFile {
    path: PathBuf,
    name: String,
    pub(super) size: u64,
    pub(super) modified: Option<SystemTime>,
}

/// The GGUF files in a model folder: the weights and, if present, a multimodal projector.
/// Compared by path, size and modification time, so it doubles as the cache key.
#[derive(Debug, Clone, PartialEq, Default)]
pub(super) struct FolderFiles {
    pub(super) main: Option<CachedFile>,
    projector: Option<CachedFile>,
}

pub(super) fn scan_folder(folder: &Path) -> FolderFiles {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return FolderFiles::default();
    };
    let mut weights: Vec<CachedFile> = Vec::new();
    let mut projectors: Vec<CachedFile> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let lower = name.to_ascii_lowercase();
        if !lower.ends_with(".gguf") {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        let file = CachedFile {
            path: entry.path(),
            name,
            size: meta.len(),
            modified: meta.modified().ok(),
        };
        if lower.contains("mmproj") {
            projectors.push(file);
        } else {
            weights.push(file);
        }
    }
    // Deterministic pick: the largest weights file, then the first projector by name.
    weights.sort_by(|a, b| b.size.cmp(&a.size).then_with(|| a.name.cmp(&b.name)));
    projectors.sort_by(|a, b| a.name.cmp(&b.name));
    FolderFiles {
        main: weights.into_iter().next(),
        projector: projectors.into_iter().next(),
    }
}

type CapabilityCache = HashMap<PathBuf, (FolderFiles, ModelCapabilities)>;

fn cache() -> &'static Mutex<CapabilityCache> {
    static CACHE: OnceLock<Mutex<CapabilityCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The cached summary for a folder, only when its files have not changed since it was read.
fn cached(folder: &Path, files: &FolderFiles) -> Option<ModelCapabilities> {
    let map = cache().lock().ok()?;
    map.get(folder)
        .filter(|(seen, _)| seen == files)
        .map(|(_, caps)| caps.clone())
}

fn store(folder: &Path, files: FolderFiles, caps: ModelCapabilities) {
    if let Ok(mut map) = cache().lock() {
        map.insert(folder.to_path_buf(), (files, caps));
    }
}

/// Summary for a folder. Reuses the cached summary while the folder's GGUF files are unchanged.
fn summarise(folder: &Path, engine: &'static str) -> Result<ModelCapabilities, String> {
    let files = scan_folder(folder);
    if let Some(hit) = cached(folder, &files) {
        return Ok(hit);
    }
    let caps = build_capabilities(&files, engine)?;
    store(folder, files, caps.clone());
    Ok(caps)
}

fn build_capabilities(
    files: &FolderFiles,
    engine: &'static str,
) -> Result<ModelCapabilities, String> {
    let header = match &files.main {
        Some(main) => gguf::read_header(&main.path)?,
        None => GgufHeader::default(),
    };
    // A projector that cannot be read leaves the audio flag unknown rather than failing the summary.
    let has_audio_encoder = files
        .projector
        .as_ref()
        .and_then(|projector| gguf::read_header(&projector.path).ok())
        .and_then(|projector| projector.has_audio_encoder);
    // The file name is tried first: it keeps variants such as `Q8_K_XL`, which `general.file_type` reports as plain Q8_0.
    let quantisation = files
        .main
        .as_ref()
        .and_then(|main| quant_from_filename(&main.name))
        .or_else(|| {
            header
                .file_type
                .and_then(quant_from_file_type)
                .map(str::to_string)
        });
    let template = header.chat_template.as_deref();
    Ok(ModelCapabilities {
        engine: engine.to_string(),
        context_length: header.context_length,
        architecture: header.architecture,
        quantisation,
        has_vision_projector: files.projector.is_some(),
        has_audio_encoder,
        thinking_hint: template.map(mentions_thinking),
        tool_call_hint: template.map(mentions_tool_calls),
    })
}

/// Markers that a chat template handles thinking. Heuristic: templates differ, so this is shown as "likely".
fn mentions_thinking(template: &str) -> bool {
    [
        "<think>",
        "</think>",
        "<|think|>",
        "enable_thinking",
        "reasoning_content",
    ]
    .iter()
    .any(|marker| template.contains(marker))
}

/// Markers that a chat template renders tool definitions or tool calls. Heuristic, shown as "likely".
fn mentions_tool_calls(template: &str) -> bool {
    ["tool_call", "tools"]
        .iter()
        .any(|marker| template.contains(marker))
}

/// Quantisation name for a `general.file_type` value (llama.cpp `llama_ftype`). Unknown values give `None`.
fn quant_from_file_type(file_type: i64) -> Option<&'static str> {
    Some(match file_type {
        0 => "F32",
        1 => "F16",
        2 => "Q4_0",
        3 => "Q4_1",
        7 => "Q8_0",
        8 => "Q5_0",
        9 => "Q5_1",
        10 => "Q2_K",
        11 => "Q3_K_S",
        12 => "Q3_K_M",
        13 => "Q3_K_L",
        14 => "Q4_K_S",
        15 => "Q4_K_M",
        16 => "Q5_K_S",
        17 => "Q5_K_M",
        18 => "Q6_K",
        19 => "IQ2_XXS",
        20 => "IQ2_XS",
        21 => "Q2_K_S",
        22 => "IQ3_XS",
        23 => "IQ3_XXS",
        24 => "IQ1_S",
        25 => "IQ4_NL",
        26 => "IQ3_S",
        27 => "IQ3_M",
        28 => "IQ2_S",
        29 => "IQ2_M",
        30 => "IQ4_XS",
        31 => "IQ1_M",
        32 => "BF16",
        _ => return None,
    })
}

/// Quantisation token in a file name, such as `Q4_K_M` or `IQ4_XS`. The last matching token wins.
fn quant_from_filename(file_name: &str) -> Option<String> {
    file_name
        .to_ascii_uppercase()
        .split(['-', '.', ' '])
        .rfind(|token| is_quant_token(token))
        .map(str::to_string)
}

fn is_quant_token(token: &str) -> bool {
    if matches!(token, "F16" | "F32" | "BF16") {
        return true;
    }
    let rest = token.strip_prefix("IQ").or_else(|| token.strip_prefix('Q'));
    rest.is_some_and(|r| r.starts_with(|c: char| c.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gguf::test_support::{build_header, kv_bool, kv_string, kv_u32};

    /// A fresh folder under the temp dir, unique per test so the shared cache never mixes them.
    fn fresh_folder(tag: &str) -> PathBuf {
        let folder = std::env::temp_dir().join(format!("localgenie-cap-{tag}"));
        let _ = std::fs::remove_dir_all(&folder);
        std::fs::create_dir_all(&folder).expect("create temp model folder");
        folder
    }

    #[test]
    fn quant_comes_from_the_file_name_token() {
        assert_eq!(
            quant_from_filename("Qwen3.5-0.8B-UD-Q8_K_XL.gguf").as_deref(),
            Some("Q8_K_XL")
        );
        assert_eq!(
            quant_from_filename("gemma-4-E4B-it-Q4_1.gguf").as_deref(),
            Some("Q4_1")
        );
        assert_eq!(
            quant_from_filename("Model-IQ4_XS.gguf").as_deref(),
            Some("IQ4_XS")
        );
        assert_eq!(quant_from_filename("qwen-f16.gguf").as_deref(), Some("F16"));
        assert_eq!(quant_from_filename("model.gguf"), None);
        assert_eq!(quant_from_filename("Qwen3-4B.gguf"), None);
    }

    #[test]
    fn quant_maps_known_file_types_only() {
        assert_eq!(quant_from_file_type(7), Some("Q8_0"));
        assert_eq!(quant_from_file_type(15), Some("Q4_K_M"));
        assert_eq!(quant_from_file_type(99), None);
    }

    #[test]
    fn chat_template_markers_give_likely_hints() {
        assert!(mentions_thinking(
            "{% if enable_thinking %}<think>{% endif %}"
        ));
        assert!(!mentions_thinking("{{ messages }}"));
        assert!(mentions_tool_calls("{% if tools %}<tool_call>{% endif %}"));
        assert!(!mentions_tool_calls("{{ messages }}"));
    }

    #[test]
    fn model_folder_drops_precision_and_refuses_escapes() {
        let folder = model_folder("org/repo:Q4_K_M").expect("valid name");
        assert!(folder.ends_with(Path::new("org").join("repo")));
        assert!(model_folder("").is_err());
        assert!(model_folder("../escape").is_err());
        assert!(model_folder("C:/Windows").is_err());
        assert!(model_folder("org/../../x").is_err());
    }

    #[test]
    fn summarises_weights_and_projector_in_one_folder() {
        let folder = fresh_folder("full");
        let main = build_header(&[
            kv_string("general.architecture", "qwen3"),
            kv_u32("qwen3.context_length", 40960),
            kv_u32("general.file_type", 15),
            kv_string(
                "tokenizer.chat_template",
                "<think>{% if tools %}<tool_call>{% endif %}",
            ),
        ]);
        std::fs::write(folder.join("Qwen3-4B-UD-Q4_K_XL.gguf"), main).expect("write weights");
        let projector = build_header(&[
            kv_string("general.architecture", "clip"),
            kv_bool("clip.has_audio_encoder", true),
        ]);
        std::fs::write(folder.join("mmproj-Qwen3-VL.gguf"), projector).expect("write projector");

        let got = summarise(&folder, "llama_cpp").expect("summary");
        assert_eq!(
            got,
            ModelCapabilities {
                engine: "llama_cpp".into(),
                context_length: Some(40960),
                architecture: Some("qwen3".into()),
                quantisation: Some("Q4_K_XL".into()),
                has_vision_projector: true,
                has_audio_encoder: Some(true),
                thinking_hint: Some(true),
                tool_call_hint: Some(true),
            }
        );
    }

    #[test]
    fn missing_folder_gives_an_all_null_summary() {
        let folder = std::env::temp_dir().join("localgenie-cap-does-not-exist");
        let _ = std::fs::remove_dir_all(&folder);
        let got = summarise(&folder, "qairt").expect("summary");
        assert_eq!(
            got,
            ModelCapabilities {
                engine: "qairt".into(),
                context_length: None,
                architecture: None,
                quantisation: None,
                has_vision_projector: false,
                has_audio_encoder: None,
                thinking_hint: None,
                tool_call_hint: None,
            }
        );
    }

    #[test]
    fn cache_is_kept_until_the_files_change() {
        let folder = fresh_folder("cache");
        let first = build_header(&[kv_string("general.architecture", "llama")]);
        std::fs::write(folder.join("model-Q8_0.gguf"), first).expect("write weights");
        let caps = summarise(&folder, "llama_cpp").expect("summary");
        assert!(cached(&folder, &scan_folder(&folder)).is_some());

        // A rewrite with a different size changes the fingerprint, so the old summary is no longer served.
        let second = build_header(&[
            kv_string("general.architecture", "llama"),
            kv_u32("llama.context_length", 2048),
        ]);
        std::fs::write(folder.join("model-Q8_0.gguf"), second).expect("rewrite weights");
        assert!(cached(&folder, &scan_folder(&folder)).is_none());
        let refreshed = summarise(&folder, "llama_cpp").expect("summary");
        assert_eq!(refreshed.context_length, Some(2048));
        assert_ne!(refreshed, caps);
    }
}
