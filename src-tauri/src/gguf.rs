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
    let mut context_lengths: Vec<(String, i64)> = Vec::new();
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
        } else if key.ends_with(".context_length") && is_integer(ty) {
            let value = read_integer(&mut reader, ty)?;
            context_lengths.push((key, value));
        } else {
            skip_value(&mut reader, ty)?;
        }
    }

    // The architecture can appear after its context key, so the lookup waits until the whole header is read.
    header.context_length = header.architecture.as_ref().and_then(|architecture| {
        let wanted = format!("{architecture}.context_length");
        context_lengths
            .iter()
            .find(|(key, _)| *key == wanted)
            .map(|(_, value)| *value)
    });
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
    use super::test_support::{build_header, kv_bool, kv_string, kv_u32};
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
