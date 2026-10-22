//! Minimal GGUF header reader. Only the metadata key-value section is parsed; tensors are never touched.

use std::fs::File;
use std::io::{self, BufReader, Read};
use std::path::Path;

const GGUF_MAGIC: &[u8; 4] = b"GGUF";
/// Longest string accepted from the header; real keys and values are far shorter.
const MAX_STRING_LEN: u64 = 1 << 20;

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

/// Native context length (`<architecture>.context_length`) from a GGUF file, or `None` if absent.
pub fn read_context_length(path: &Path) -> Result<Option<i64>, String> {
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

    let mut architecture: Option<String> = None;
    let mut context_lengths: Vec<(String, i64)> = Vec::new();
    for _ in 0..kv_count {
        let key = read_string(&mut reader)?;
        let ty = read_u32(&mut reader)?;
        if key == "general.architecture" && ty == TYPE_STRING {
            architecture = Some(read_string(&mut reader)?);
        } else if key.ends_with(".context_length") && is_integer(ty) {
            let value = read_integer(&mut reader, ty)?;
            context_lengths.push((key, value));
        } else {
            skip_value(&mut reader, ty)?;
        }
    }

    let Some(architecture) = architecture else {
        return Ok(None);
    };
    let wanted = format!("{architecture}.context_length");
    Ok(context_lengths
        .into_iter()
        .find(|(key, _)| *key == wanted)
        .map(|(_, value)| value))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn push_string(buf: &mut Vec<u8>, s: &str) {
        buf.extend_from_slice(&(s.len() as u64).to_le_bytes());
        buf.extend_from_slice(s.as_bytes());
    }

    /// A header with an array (skipped), the architecture string, and `<arch>.context_length`.
    fn sample_header(arch: &str, context: u32) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(GGUF_MAGIC);
        buf.extend_from_slice(&3u32.to_le_bytes());
        buf.extend_from_slice(&0u64.to_le_bytes());
        buf.extend_from_slice(&3u64.to_le_bytes());

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
        let at = header.windows(needle.len()).position(|w| w == needle).unwrap();
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
}
