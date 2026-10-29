//! Reads the length of a WAV file from its header. Only the chunk headers are read, so a long
//! recording is never loaded whole. Any PCM or float WAV is accepted; the length is the data chunk's
//! size divided by the byte rate in the format chunk.

use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

const RIFF: &[u8; 4] = b"RIFF";
const WAVE: &[u8; 4] = b"WAVE";
const FMT_CHUNK: &[u8; 4] = b"fmt ";
const DATA_CHUNK: &[u8; 4] = b"data";
/// Bytes of the RIFF header: "RIFF", the size, "WAVE".
const RIFF_HEADER_BYTES: u64 = 12;
/// Bytes of a chunk header: the four-letter id and the size.
const CHUNK_HEADER_BYTES: u64 = 8;
/// Offset of the byte rate inside the format chunk: format, channels and sample rate come first.
const FMT_BYTE_RATE_OFFSET: u64 = 8;

/// The length of the WAV file at `path`, in seconds.
pub(super) fn duration_seconds(path: &Path) -> Result<f64, String> {
    let file = File::open(path).map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
    let length = file
        .metadata()
        .map_err(|e| format!("Cannot read {}: {e}", path.display()))?
        .len();
    read_duration(BufReader::new(file), length)
}

/// The length of a WAV held in `reader`, `length` bytes long, in seconds. The data chunk is cut at
/// `length`, so a header that claims more data than the file holds gives the length of what is there.
pub(super) fn read_duration<R: Read + Seek>(mut reader: R, length: u64) -> Result<f64, String> {
    let mut riff = [0u8; RIFF_HEADER_BYTES as usize];
    reader
        .read_exact(&mut riff)
        .map_err(|_| "The file is too short to be a WAV file.".to_string())?;
    if &riff[0..4] != RIFF || &riff[8..12] != WAVE {
        return Err("The file is not a WAV file.".to_string());
    }

    let mut byte_rate: Option<u32> = None;
    let mut data_bytes: Option<u64> = None;
    let mut position = RIFF_HEADER_BYTES;
    while byte_rate.is_none() || data_bytes.is_none() {
        if position + CHUNK_HEADER_BYTES > length {
            break;
        }
        reader
            .seek(SeekFrom::Start(position))
            .map_err(|e| format!("Cannot read the WAV header: {e}"))?;
        let mut header = [0u8; CHUNK_HEADER_BYTES as usize];
        reader
            .read_exact(&mut header)
            .map_err(|e| format!("Cannot read the WAV header: {e}"))?;
        let id = &header[0..4];
        let size = u64::from(u32::from_le_bytes([
            header[4], header[5], header[6], header[7],
        ]));
        let body = position + CHUNK_HEADER_BYTES;
        if id == FMT_CHUNK && byte_rate.is_none() {
            byte_rate = Some(read_byte_rate(&mut reader, body, length)?);
        } else if id == DATA_CHUNK && data_bytes.is_none() {
            data_bytes = Some(size.min(length.saturating_sub(body)));
        }
        // Chunks are padded to an even length.
        position = body + size + (size % 2);
    }

    match (byte_rate, data_bytes) {
        (Some(rate), Some(bytes)) if rate > 0 => Ok(bytes as f64 / f64::from(rate)),
        (Some(_), Some(_)) => Err("The WAV file has an empty format chunk.".to_string()),
        _ => Err("The WAV file has no readable format or data chunk.".to_string()),
    }
}

/// The byte rate in the format chunk whose body starts at `body`.
fn read_byte_rate<R: Read + Seek>(reader: &mut R, body: u64, length: u64) -> Result<u32, String> {
    if body + FMT_BYTE_RATE_OFFSET + 4 > length {
        return Err("The WAV format chunk is cut short.".to_string());
    }
    reader
        .seek(SeekFrom::Start(body + FMT_BYTE_RATE_OFFSET))
        .map_err(|e| format!("Cannot read the WAV header: {e}"))?;
    let mut rate = [0u8; 4];
    reader
        .read_exact(&mut rate)
        .map_err(|e| format!("Cannot read the WAV header: {e}"))?;
    Ok(u32::from_le_bytes(rate))
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::super::test_support::Scratch;
    use super::*;

    /// A WAV with a `fmt ` chunk and a `data` chunk of `data` bytes, at `rate` bytes a second.
    fn wav(rate: u32, data: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(4 + 24 + 8 + data.len() as u32).to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
        bytes.extend_from_slice(&1u16.to_le_bytes()); // mono
        bytes.extend_from_slice(&24_000u32.to_le_bytes());
        bytes.extend_from_slice(&rate.to_le_bytes());
        bytes.extend_from_slice(&2u16.to_le_bytes()); // block align
        bytes.extend_from_slice(&16u16.to_le_bytes()); // bits
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&(data.len() as u32).to_le_bytes());
        bytes.extend_from_slice(data);
        bytes
    }

    fn duration(bytes: &[u8]) -> Result<f64, String> {
        read_duration(Cursor::new(bytes), bytes.len() as u64)
    }

    #[test]
    fn length_is_the_data_size_over_the_byte_rate() {
        // 48 000 bytes a second, 96 000 bytes of data: two seconds.
        let bytes = wav(48_000, &vec![0u8; 96_000]);
        assert_eq!(duration(&bytes), Ok(2.0));
    }

    #[test]
    fn a_list_chunk_before_the_data_is_skipped() {
        let mut bytes = wav(16_000, &vec![0u8; 32_000]);
        // Insert an odd-sized LIST chunk (3 bytes plus one pad byte) right after the RIFF header.
        let mut list = b"LIST".to_vec();
        list.extend_from_slice(&3u32.to_le_bytes());
        list.extend_from_slice(b"abc\0");
        bytes.splice(12..12, list);
        let total = bytes.len() as u32 - 8;
        bytes[4..8].copy_from_slice(&total.to_le_bytes());
        assert_eq!(duration(&bytes), Ok(2.0));
    }

    #[test]
    fn a_data_size_larger_than_the_file_is_cut_to_the_file() {
        let mut bytes = wav(16_000, &vec![0u8; 16_000]);
        let data_size_at = bytes.len() - 16_000 - 4;
        bytes[data_size_at..data_size_at + 4].copy_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(duration(&bytes), Ok(1.0));
    }

    #[test]
    fn a_file_that_is_not_riff_wave_is_refused() {
        assert!(duration(b"ID3\x04\x00\x00\x00\x00\x00\x00\x00\x00\x00").is_err());
        let mut not_wave = wav(16_000, &[0; 8]);
        not_wave[8..12].copy_from_slice(b"AVI ");
        assert!(duration(&not_wave).is_err());
        assert!(duration(b"RIFF").is_err(), "too short");
    }

    #[test]
    fn a_file_without_a_data_chunk_is_refused() {
        let mut bytes = wav(16_000, &[0; 8]);
        bytes.truncate(36); // the RIFF header and the format chunk only
        assert!(duration(&bytes).is_err());
    }

    #[test]
    fn a_zero_byte_rate_is_refused_rather_than_dividing_by_zero() {
        assert!(duration(&wav(0, &[0; 8])).is_err());
    }

    #[test]
    fn duration_seconds_reads_a_file_on_disk() {
        let scratch = Scratch::new("wav-file");
        let path = scratch.path().join("tone.wav");
        std::fs::write(&path, wav(32_000, &vec![0u8; 64_000])).expect("wav");
        assert_eq!(duration_seconds(&path), Ok(2.0));
        assert!(duration_seconds(&scratch.path().join("missing.wav")).is_err());
    }
}
