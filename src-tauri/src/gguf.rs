//! Minimal GGUF header reader. Only the metadata key-value section is parsed; tensors are never touched.

use std::fs::File;
use std::io::{self, BufReader, Read};
use std::path::Path;

const GGUF_MAGIC: &[u8; 4] = b"GGUF";
/// Longest string accepted from the header; real keys and values are far shorter.
const MAX_STRING_LEN: u64 = 1 << 20;
/// Longest chat template read into memory. A longer template is skipped, so its hints stay unknown.
pub const MAX_CHAT_TEMPLATE_BYTES: u64 = 256 * 1024;

const TYPE_UINT8: u32 = 0;
const TYPE_INT8: u32 = 1;
const TYPE_UINT16: u32 = 2;
const TYPE_INT16: u32 = 3;
const TYPE_UINT32: u32 = 4;
const TYPE_INT32: u32 = 5;
const TYPE_BOOL: u32 = 7;
const TYPE_STRING: u32 = 8;
const TYPE_ARRAY: u32 = 9;
const TYPE_UINT64: u32 = 10;
const TYPE_INT64: u32 = 11;

/// Metadata read in one pass over the header. A field is `None` when the file does not carry it.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct GgufHeader {
    /// `general.architecture`.
    pub architecture: Option<String>,
    /// `<architecture>.context_length`.
    pub context_length: Option<i64>,
    /// `general.file_type`, the llama.cpp quantisation enum.
    pub file_type: Option<i64>,
    /// `tokenizer.chat_template`. `None` when absent, not UTF-8, or longer than `MAX_CHAT_TEMPLATE_BYTES`.
    pub chat_template: Option<String>,
    /// `clip.has_audio_encoder`. Only multimodal projector files carry it.
    pub has_audio_encoder: Option<bool>,
    /// `<architecture>.block_count`: transformer layers.
    pub block_count: Option<i64>,
    /// `<architecture>.embedding_length`.
    pub embedding_length: Option<i64>,
    /// `<architecture>.attention.head_count`: query heads.
    pub head_count: Option<i64>,
    /// `<architecture>.attention.head_count_kv`: KV heads. Per-layer arrays are skipped, so `None`.
    pub head_count_kv: Option<i64>,
    /// `<architecture>.attention.key_length`: width of one key head.
    pub key_length: Option<i64>,
    /// `<architecture>.attention.value_length`: width of one value head.
    pub value_length: Option<i64>,
    /// `<architecture>.full_attention_interval`: in hybrid models only every Nth layer keeps a KV cache.
    pub full_attention_interval: Option<i64>,
    /// `<architecture>.attention.head_count_kv` as a per-layer array. Zero means the layer keeps no cache.
    pub head_count_kv_per_layer: Option<Vec<i64>>,
    /// `<architecture>.attention.sliding_window`: tokens kept by sliding-window layers.
    pub sliding_window: Option<i64>,
    /// `<architecture>.attention.sliding_window_pattern`: per layer, `true` for a sliding-window layer.
    pub sliding_window_pattern: Option<Vec<bool>>,
    /// `<architecture>.attention.kv_lora_rank`: latent attention, whose cache layout is not modelled.
    pub kv_lora_rank: Option<i64>,
}

/// Architecture-prefixed integer keys the app reads. The prefix is the architecture from the header.
const ARCH_INTEGER_SUFFIXES: [&str; 10] = [
    ".attention.sliding_window",
    ".attention.kv_lora_rank",
    ".full_attention_interval",
    ".context_length",
    ".block_count",
    ".embedding_length",
    ".attention.head_count",
    ".attention.head_count_kv",
    ".attention.key_length",
    ".attention.value_length",
];

/// Architecture-prefixed array keys the app reads (per-layer values).
const ARCH_ARRAY_SUFFIXES: [&str; 2] = [".attention.head_count_kv", ".attention.sliding_window_pattern"];

/// Bytes per cached element for the KV cache, assuming an f16 cache (keys and values).
const KV_BYTES_PER_ELEMENT: u64 = 2;

impl GgufHeader {
    /// KV-cache size in bytes for `n_ctx` tokens, assuming an f16 cache. This is the memory the
    /// cache reserves for the whole window, not what the conversation has filled so far.
    /// `None` when the header lacks the layer count or head sizes, or the numbers do not fit.
    pub fn kv_cache_bytes(&self, n_ctx: u64) -> Option<u64> {
        // Latent attention stores a compressed cache whose layout this formula does not describe.
        if self.kv_lora_rank.is_some() {
            return None;
        }
        let block_count = u64::try_from(self.block_count?).ok()?;
        let key_width = match self.key_length {
            Some(width) => width,
            None => self.embedding_length?.checked_div(self.head_count?)?,
        };
        let value_width = self.value_length.unwrap_or(key_width);
        let bytes_per_head_token = u64::try_from(key_width.checked_add(value_width)?)
            .ok()?
            .checked_mul(KV_BYTES_PER_ELEMENT)?;

        let mut total = 0_u64;
        for (layer, kv_heads) in self.kv_heads_per_layer(block_count)?.into_iter().enumerate() {
            if kv_heads == 0 {
                continue;
            }
            let tokens = match self.window_for(layer)? {
                Some(window) => n_ctx.min(window),
                None => n_ctx,
            };
            let layer_bytes = kv_heads
                .checked_mul(bytes_per_head_token)?
                .checked_mul(tokens)?;
            total = total.checked_add(layer_bytes)?;
        }
        Some(total)
    }

    /// KV heads of each layer. Zero means the layer keeps no cache (a recurrent layer).
    fn kv_heads_per_layer(&self, block_count: u64) -> Option<Vec<u64>> {
        if let Some(per_layer) = &self.head_count_kv_per_layer {
            if per_layer.len() as u64 != block_count {
                return None;
            }
            return per_layer
                .iter()
                .map(|heads| u64::try_from(*heads).ok())
                .collect();
        }
        let kv_heads = u64::try_from(self.head_count_kv?).ok()?;
        // Hybrid models (attention mixed with recurrent layers) keep a cache only in every Nth layer.
        let interval = self
            .full_attention_interval
            .filter(|interval| *interval > 1)
            .map(u64::try_from)
            .transpose()
            .ok()?;
        Some(
            (0..block_count)
                .map(|layer| match interval {
                    Some(n) if (layer + 1) % n != 0 => 0,
                    _ => kv_heads,
                })
                .collect(),
        )
    }

    /// Sliding window of a layer: `Some(Some(window))` for a sliding-window layer, `Some(None)` for a
    /// full-context layer. `None` when a window is set without a per-layer pattern, since the layer kinds are unknown.
    fn window_for(&self, layer: usize) -> Option<Option<u64>> {
        let Some(window) = self.sliding_window else {
            return Some(None);
        };
        let window = u64::try_from(window).ok()?;
        let pattern = self.sliding_window_pattern.as_ref()?;
        Some(if *pattern.get(layer)? {
            Some(window)
        } else {
            None
        })
    }
}

/// Read an array of integers or booleans, stored as `i64` (booleans as 0 or 1). Other element types
/// are skipped and give `None`.
fn read_array<R: Read>(r: &mut R) -> Result<Option<Vec<i64>>, String> {
    let element_type = read_u32(r)?;
    let count = read_u64(r)?;
    if !(is_integer(element_type) || element_type == TYPE_BOOL) {
        for _ in 0..count {
            skip_value(r, element_type)?;
        }
        return Ok(None);
    }
    let mut values = Vec::with_capacity(usize::try_from(count.min(4096)).unwrap_or(0));
    for _ in 0..count {
        values.push(if element_type == TYPE_BOOL {
            i64::from(read_bool(r)?)
        } else {
            read_integer(r, element_type)?
        });
    }
    Ok(Some(values))
}

/// Read the metadata keys the app uses in one pass over the header. Tensors are never read.
/// Missing keys are `None`. Errors are only for files that are not readable GGUF headers.
pub fn read_header(path: &Path) -> Result<GgufHeader, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open {}: {e}", path.display()))?;
    let mut reader = BufReader::new(file);

    let mut magic = [0u8; 4];
    reader.read_exact(&mut magic).map_err(io_err)?;
    if &magic != GGUF_MAGIC {
        return Err("Not a GGUF file".into());
    }
    let version = read_u32(&mut reader)?;
    if version < 2 {
        return Err(format!("Unsupported GGUF version {version}"));
    }
    let _tensor_count = read_u64(&mut reader)?;
    let kv_count = read_u64(&mut reader)?;

    let mut header = GgufHeader::default();
    let mut arch_integers: Vec<(String, i64)> = Vec::new();
    let mut arch_arrays: Vec<(String, Vec<i64>)> = Vec::new();
    for _ in 0..kv_count {
        let key = read_string(&mut reader)?;
        let ty = read_u32(&mut reader)?;
        if key == "general.architecture" && ty == TYPE_STRING {
            header.architecture = Some(read_string(&mut reader)?);
        } else if key == "general.file_type" && is_integer(ty) {
            header.file_type = Some(read_integer(&mut reader, ty)?);
        } else if key == "tokenizer.chat_template" && ty == TYPE_STRING {
            header.chat_template = read_capped_string(&mut reader, MAX_CHAT_TEMPLATE_BYTES)?;
        } else if key == "clip.has_audio_encoder" && ty == TYPE_BOOL {
            header.has_audio_encoder = Some(read_bool(&mut reader)?);
        } else if is_integer(ty) && ARCH_INTEGER_SUFFIXES.iter().any(|suffix| key.ends_with(suffix)) {
            let value = read_integer(&mut reader, ty)?;
            arch_integers.push((key, value));
        } else if ty == TYPE_ARRAY && ARCH_ARRAY_SUFFIXES.iter().any(|suffix| key.ends_with(suffix)) {
            if let Some(values) = read_array(&mut reader)? {
                arch_arrays.push((key, values));
            }
        } else {
            skip_value(&mut reader, ty)?;
        }
    }

    // The architecture can appear after its keys, so the lookup waits until the whole header is read.
    let lookup = |suffix: &str| {
        let wanted = format!("{}{suffix}", header.architecture.as_deref()?);
        arch_integers
            .iter()
            .find(|(key, _)| *key == wanted)
            .map(|(_, value)| *value)
    };
    header.context_length = lookup(".context_length");
    header.block_count = lookup(".block_count");
    header.embedding_length = lookup(".embedding_length");
    header.head_count = lookup(".attention.head_count");
    header.head_count_kv = lookup(".attention.head_count_kv");
    header.key_length = lookup(".attention.key_length");
    header.value_length = lookup(".attention.value_length");
    header.full_attention_interval = lookup(".full_attention_interval");
    header.sliding_window = lookup(".attention.sliding_window");
    header.kv_lora_rank = lookup(".attention.kv_lora_rank");
    let lookup_array = |suffix: &str| {
        let wanted = format!("{}{suffix}", header.architecture.as_deref()?);
        arch_arrays
            .iter()
            .find(|(key, _)| *key == wanted)
            .map(|(_, values)| values.clone())
    };
    header.head_count_kv_per_layer = lookup_array(".attention.head_count_kv");
    header.sliding_window_pattern = lookup_array(".attention.sliding_window_pattern")
        .map(|values| values.into_iter().map(|value| value != 0).collect());
    Ok(header)
}

/// Native context length (`<architecture>.context_length`) from a GGUF file, or `None` if absent.
pub fn read_context_length(path: &Path) -> Result<Option<i64>, String> {
    Ok(read_header(path)?.context_length)
}

fn io_err(e: io::Error) -> String {
    format!("Failed to read GGUF header: {e}")
}

fn read_u32<R: Read>(r: &mut R) -> Result<u32, String> {
    let mut buf = [0u8; 4];
    r.read_exact(&mut buf).map_err(io_err)?;
    Ok(u32::from_le_bytes(buf))
}

fn read_u64<R: Read>(r: &mut R) -> Result<u64, String> {
    let mut buf = [0u8; 8];
    r.read_exact(&mut buf).map_err(io_err)?;
    Ok(u64::from_le_bytes(buf))
}

fn read_string<R: Read>(r: &mut R) -> Result<String, String> {
    let len = read_u64(r)?;
    if len > MAX_STRING_LEN {
        return Err(format!("GGUF string too long ({len} bytes)"));
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf).map_err(io_err)?;
    String::from_utf8(buf).map_err(|e| format!("Invalid UTF-8 in GGUF header: {e}"))
}

/// Read a string value that may be large. Longer than `cap` bytes: skip it and return `None`.
/// Invalid UTF-8 also gives `None`, so the header read continues either way.
fn read_capped_string<R: Read>(r: &mut R, cap: u64) -> Result<Option<String>, String> {
    let len = read_u64(r)?;
    if len > cap {
        skip_bytes(r, len)?;
        return Ok(None);
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf).map_err(io_err)?;
    Ok(String::from_utf8(buf).ok())
}

fn read_bool<R: Read>(r: &mut R) -> Result<bool, String> {
    let mut buf = [0u8; 1];
    r.read_exact(&mut buf).map_err(io_err)?;
    Ok(buf[0] != 0)
}

fn is_integer(ty: u32) -> bool {
    matches!(
        ty,
        TYPE_UINT8
            | TYPE_INT8
            | TYPE_UINT16
            | TYPE_INT16
            | TYPE_UINT32
            | TYPE_INT32
            | TYPE_UINT64
            | TYPE_INT64
    )
}

fn read_integer<R: Read>(r: &mut R, ty: u32) -> Result<i64, String> {
    Ok(match ty {
        TYPE_UINT8 | TYPE_INT8 => {
            let mut buf = [0u8; 1];
            r.read_exact(&mut buf).map_err(io_err)?;
            if ty == TYPE_INT8 {
                i8::from_le_bytes(buf) as i64
            } else {
                buf[0] as i64
            }
        }
        TYPE_UINT16 | TYPE_INT16 => {
            let mut buf = [0u8; 2];
            r.read_exact(&mut buf).map_err(io_err)?;
            if ty == TYPE_INT16 {
                i16::from_le_bytes(buf) as i64
            } else {
                u16::from_le_bytes(buf) as i64
            }
        }
        TYPE_UINT32 => read_u32(r)? as i64,
        TYPE_INT32 => read_u32(r)? as i32 as i64,
        TYPE_UINT64 | TYPE_INT64 => read_u64(r)? as i64,
        _ => return Err(format!("GGUF type {ty} is not an integer")),
    })
}

/// Consume one value of type `ty` without keeping it.
fn skip_value<R: Read>(r: &mut R, ty: u32) -> Result<(), String> {
    let fixed = match ty {
        TYPE_UINT8 | TYPE_INT8 | TYPE_BOOL => 1,
        TYPE_UINT16 | TYPE_INT16 => 2,
        TYPE_UINT32 | TYPE_INT32 | 6 => 4,
        TYPE_UINT64 | TYPE_INT64 | 12 => 8,
        TYPE_STRING => {
            let len = read_u64(r)?;
            return skip_bytes(r, len);
        }
        TYPE_ARRAY => {
            let elem_ty = read_u32(r)?;
            let count = read_u64(r)?;
            for _ in 0..count {
                skip_value(r, elem_ty)?;
            }
            return Ok(());
        }
        _ => return Err(format!("Unknown GGUF value type {ty}")),
    };
    skip_bytes(r, fixed)
}

fn skip_bytes<R: Read>(r: &mut R, len: u64) -> Result<(), String> {
    let copied = io::copy(&mut r.take(len), &mut io::sink()).map_err(io_err)?;
    if copied != len {
        return Err("GGUF header ended unexpectedly".into());
    }
    Ok(())
}

/// Header builders shared with the tests of other modules (`commands::capabilities`).
#[cfg(test)]
pub(crate) mod test_support {
    use super::*;

    fn push_string(buf: &mut Vec<u8>, s: &str) {
        buf.extend_from_slice(&(s.len() as u64).to_le_bytes());
        buf.extend_from_slice(s.as_bytes());
    }

    pub fn kv_string(key: &str, value: &str) -> Vec<u8> {
        let mut buf = Vec::new();
        push_string(&mut buf, key);
        buf.extend_from_slice(&TYPE_STRING.to_le_bytes());
        push_string(&mut buf, value);
        buf
    }

    pub fn kv_u32(key: &str, value: u32) -> Vec<u8> {
        let mut buf = Vec::new();
        push_string(&mut buf, key);
        buf.extend_from_slice(&TYPE_UINT32.to_le_bytes());
        buf.extend_from_slice(&value.to_le_bytes());
        buf
    }

    pub fn kv_bool(key: &str, value: bool) -> Vec<u8> {
        let mut buf = Vec::new();
        push_string(&mut buf, key);
        buf.extend_from_slice(&TYPE_BOOL.to_le_bytes());
        buf.push(u8::from(value));
        buf
    }

    /// An array entry of integers (`TYPE_INT32`) or booleans (`TYPE_BOOL`), one value per element.
    pub fn kv_array(key: &str, element_type: u32, values: &[i64]) -> Vec<u8> {
        let mut buf = Vec::new();
        push_string(&mut buf, key);
        buf.extend_from_slice(&TYPE_ARRAY.to_le_bytes());
        buf.extend_from_slice(&element_type.to_le_bytes());
        buf.extend_from_slice(&(values.len() as u64).to_le_bytes());
        for value in values {
            if element_type == TYPE_BOOL {
                buf.push(u8::from(*value != 0));
            } else {
                buf.extend_from_slice(&(*value as i32).to_le_bytes());
            }
        }
        buf
    }

    /// A GGUF v3 header holding the given key-value entries and no tensors.
    pub fn build_header(entries: &[Vec<u8>]) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(GGUF_MAGIC);
        buf.extend_from_slice(&3u32.to_le_bytes());
        buf.extend_from_slice(&0u64.to_le_bytes());
        buf.extend_from_slice(&(entries.len() as u64).to_le_bytes());
        for entry in entries {
            buf.extend_from_slice(entry);
        }
        buf
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{build_header, kv_array, kv_bool, kv_string, kv_u32};
    use super::*;

    /// A header with an array (skipped), the architecture string, and `<arch>.context_length`.
    fn sample_header(arch: &str, context: u32) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(GGUF_MAGIC);
        buf.extend_from_slice(&3u32.to_le_bytes());
        buf.extend_from_slice(&0u64.to_le_bytes());
        buf.extend_from_slice(&3u64.to_le_bytes());

        let push_string = |buf: &mut Vec<u8>, s: &str| {
            buf.extend_from_slice(&(s.len() as u64).to_le_bytes());
            buf.extend_from_slice(s.as_bytes());
        };
        push_string(&mut buf, "tokenizer.ggml.tokens");
        buf.extend_from_slice(&TYPE_ARRAY.to_le_bytes());
        buf.extend_from_slice(&TYPE_STRING.to_le_bytes());
        buf.extend_from_slice(&2u64.to_le_bytes());
        push_string(&mut buf, "<s>");
        push_string(&mut buf, "</s>");

        push_string(&mut buf, "general.architecture");
        buf.extend_from_slice(&TYPE_STRING.to_le_bytes());
        push_string(&mut buf, arch);

        push_string(&mut buf, &format!("{arch}.context_length"));
        buf.extend_from_slice(&TYPE_UINT32.to_le_bytes());
        buf.extend_from_slice(&context.to_le_bytes());
        buf
    }

    fn write_temp(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(name);
        std::fs::write(&path, bytes).expect("write temp gguf");
        path
    }

    #[test]
    fn reads_context_length_for_the_declared_architecture() {
        let path = write_temp("localgenie-test-llama.gguf", &sample_header("llama", 8192));
        let got = read_context_length(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(got, Ok(Some(8192)));
    }

    #[test]
    fn returns_none_when_the_context_key_is_missing() {
        let mut header = sample_header("qwen3", 4096);
        // Rename the context key so it no longer matches the architecture.
        let needle = b"qwen3.context_length";
        let at = header
            .windows(needle.len())
            .position(|w| w == needle)
            .unwrap();
        header[at..at + needle.len()].copy_from_slice(b"other.context_length");
        let path = write_temp("localgenie-test-missing.gguf", &header);
        let got = read_context_length(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(got, Ok(None));
    }

    #[test]
    fn rejects_files_without_the_gguf_magic() {
        let path = write_temp("localgenie-test-bad.gguf", b"NOPE0000000000000000");
        let got = read_context_length(&path);
        let _ = std::fs::remove_file(&path);
        assert!(got.is_err());
    }

    #[test]
    fn reads_architecture_file_type_and_context_in_one_pass() {
        let header = build_header(&[
            kv_string("general.architecture", "qwen3"),
            kv_u32("general.file_type", 7),
            kv_u32("qwen3.context_length", 40960),
        ]);
        let path = write_temp("localgenie-test-header.gguf", &header);
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        let got = got.expect("header parses");
        assert_eq!(got.architecture.as_deref(), Some("qwen3"));
        assert_eq!(got.file_type, Some(7));
        assert_eq!(got.context_length, Some(40960));
        assert_eq!(got.chat_template, None);
        assert_eq!(got.has_audio_encoder, None);
    }

    #[test]
    fn kv_cache_bytes_uses_layers_kv_heads_and_head_widths() {
        // 2 layers x 2 KV heads x (16 key + 16 value) elements x 2 bytes = 256 bytes per token.
        let header = build_header(&[
            kv_string("general.architecture", "llama"),
            kv_u32("llama.block_count", 2),
            kv_u32("llama.embedding_length", 64),
            kv_u32("llama.attention.head_count", 4),
            kv_u32("llama.attention.head_count_kv", 2),
        ]);
        let path = write_temp("localgenie-test-kv.gguf", &header);
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        let got = got.expect("header parses");
        assert_eq!(got.block_count, Some(2));
        assert_eq!(got.head_count_kv, Some(2));
        assert_eq!(got.kv_cache_bytes(1000), Some(256_000));
    }

    #[test]
    fn kv_cache_bytes_counts_only_the_attention_layers_of_a_hybrid_model() {
        // 8 layers with an attention layer every 4th: 2 attention layers, not 8.
        // 2 layers x 2 KV heads x (16 + 16) elements x 2 bytes = 256 bytes per token.
        let header = build_header(&[
            kv_string("general.architecture", "qwen35"),
            kv_u32("qwen35.block_count", 8),
            kv_u32("qwen35.embedding_length", 64),
            kv_u32("qwen35.attention.head_count", 4),
            kv_u32("qwen35.attention.head_count_kv", 2),
            kv_u32("qwen35.full_attention_interval", 4),
        ]);
        let path = write_temp("localgenie-test-kv-hybrid.gguf", &header);
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(got.expect("header parses").kv_cache_bytes(1000), Some(256_000));
    }

    /// Read a header built from `entries` and return its KV-cache size for `n_ctx`.
    fn kv_bytes_of(entries: &[Vec<u8>], name: &str, n_ctx: u64) -> Option<u64> {
        let path = write_temp(name, &build_header(entries));
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        got.expect("header parses").kv_cache_bytes(n_ctx)
    }

    #[test]
    fn kv_cache_bytes_counts_per_layer_kv_heads_and_skips_recurrent_layers() {
        // Layers 1 and 3 keep no cache. 2 + 2 heads x 32 elements x 2 bytes = 256 bytes per token.
        let entries = [
            kv_string("general.architecture", "custom"),
            kv_u32("custom.block_count", 4),
            kv_u32("custom.embedding_length", 64),
            kv_u32("custom.attention.head_count", 4),
            kv_array("custom.attention.head_count_kv", TYPE_INT32, &[2, 0, 2, 0]),
        ];
        assert_eq!(kv_bytes_of(&entries, "localgenie-test-kv-per-layer.gguf", 1000), Some(256_000));
    }

    #[test]
    fn kv_cache_bytes_caps_sliding_window_layers_at_the_window() {
        // Layer 0 slides over 512 tokens, layer 1 keeps the full 1000. 2 heads x 32 x 2 = 128 bytes per token.
        let entries = [
            kv_string("general.architecture", "custom"),
            kv_u32("custom.block_count", 2),
            kv_u32("custom.embedding_length", 64),
            kv_u32("custom.attention.head_count", 4),
            kv_u32("custom.attention.head_count_kv", 2),
            kv_u32("custom.attention.sliding_window", 512),
            kv_array("custom.attention.sliding_window_pattern", TYPE_BOOL, &[1, 0]),
        ];
        assert_eq!(
            kv_bytes_of(&entries, "localgenie-test-kv-window.gguf", 1000),
            Some((512 + 1000) * 128)
        );
    }

    #[test]
    fn kv_cache_bytes_is_none_for_a_window_without_a_pattern() {
        let entries = [
            kv_string("general.architecture", "custom"),
            kv_u32("custom.block_count", 2),
            kv_u32("custom.embedding_length", 64),
            kv_u32("custom.attention.head_count", 4),
            kv_u32("custom.attention.head_count_kv", 2),
            kv_u32("custom.attention.sliding_window", 512),
        ];
        assert_eq!(kv_bytes_of(&entries, "localgenie-test-kv-window-unknown.gguf", 1000), None);
    }

    #[test]
    fn kv_cache_bytes_is_none_for_latent_attention() {
        let entries = [
            kv_string("general.architecture", "custom"),
            kv_u32("custom.block_count", 2),
            kv_u32("custom.embedding_length", 64),
            kv_u32("custom.attention.head_count", 4),
            kv_u32("custom.attention.head_count_kv", 2),
            kv_u32("custom.attention.kv_lora_rank", 128),
        ];
        assert_eq!(kv_bytes_of(&entries, "localgenie-test-kv-mla.gguf", 1000), None);
    }

    #[test]
    fn kv_cache_bytes_is_none_without_the_kv_head_count() {
        let header = build_header(&[
            kv_string("general.architecture", "llama"),
            kv_u32("llama.block_count", 2),
            kv_u32("llama.embedding_length", 64),
            kv_u32("llama.attention.head_count", 4),
        ]);
        let path = write_temp("localgenie-test-kv-missing.gguf", &header);
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(got.expect("header parses").kv_cache_bytes(1000), None);
    }

    #[test]
    fn missing_keys_are_none_not_errors() {
        let header = build_header(&[kv_string("general.name", "bare")]);
        let path = write_temp("localgenie-test-empty.gguf", &header);
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(got, Ok(GgufHeader::default()));
    }

    #[test]
    fn reads_the_projector_audio_flag() {
        let header = build_header(&[
            kv_string("general.architecture", "clip"),
            kv_bool("clip.has_audio_encoder", true),
        ]);
        let path = write_temp("localgenie-test-projector.gguf", &header);
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        assert_eq!(got.expect("header parses").has_audio_encoder, Some(true));
    }

    #[test]
    fn keeps_a_chat_template_under_the_cap() {
        let template = "{% if enable_thinking %}<think>{% endif %}";
        let header = build_header(&[
            kv_string("tokenizer.chat_template", template),
            kv_u32("general.file_type", 15),
        ]);
        let path = write_temp("localgenie-test-template.gguf", &header);
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        let got = got.expect("header parses");
        assert_eq!(got.chat_template.as_deref(), Some(template));
        assert_eq!(got.file_type, Some(15));
    }

    #[test]
    fn skips_an_oversized_chat_template_and_keeps_reading() {
        let oversized = "x".repeat(MAX_CHAT_TEMPLATE_BYTES as usize + 1);
        let header = build_header(&[
            kv_string("tokenizer.chat_template", &oversized),
            kv_u32("general.file_type", 15),
        ]);
        let path = write_temp("localgenie-test-oversized.gguf", &header);
        let got = read_header(&path);
        let _ = std::fs::remove_file(&path);
        let got = got.expect("header parses");
        // The template is dropped, and the key after it is still read in the right place.
        assert_eq!(got.chat_template, None);
        assert_eq!(got.file_type, Some(15));
    }
}
