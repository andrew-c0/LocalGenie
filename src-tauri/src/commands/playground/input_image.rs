//! The input picture of an image-to-image job, checked before sd-cli reads it, and the `data:` URL
//! the webview shows as a preview. The user picks the file, so it may be in any folder. Only an image
//! extension and a size cap are enforced.

use std::fs;
use std::path::{Path, PathBuf};

use base64::{engine::general_purpose::STANDARD, Engine};

use super::paths::without_verbatim_prefix;

/// Largest input image, in bytes.
const MAX_INPUT_BYTES: u64 = 30 * 1024 * 1024;
const MEGABYTE: u64 = 1024 * 1024;
/// The extensions an input image may have, in lower case, with the MIME type each one is sent as.
const INPUT_TYPES: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
];

/// An input image that passed `validate_input_image`: its canonical path, and its MIME type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct InputImage {
    pub path: PathBuf,
    pub mime: &'static str,
}

/// Checks a path the webview sent: it exists, is a file (not a folder), has a PNG or JPG extension
/// and is within the size cap. Returns the canonical path, without the Windows verbatim prefix that
/// sd-cli cannot open.
pub(super) fn validate_input_image(raw: &str) -> Result<InputImage, String> {
    let canonical = fs::canonicalize(raw).map_err(|_| format!("Input image not found: {raw}"))?;
    if !canonical.is_file() {
        return Err(format!("Not an image file: {raw}"));
    }
    let mime = mime_type(&canonical)
        .ok_or_else(|| format!("Input images must be PNG or JPG files: {raw}"))?;
    let size = fs::metadata(&canonical)
        .map_err(|e| format!("Cannot read {raw}: {e}"))?
        .len();
    check_size(size)?;
    Ok(InputImage {
        path: without_verbatim_prefix(&canonical),
        mime,
    })
}

/// Refuses a file larger than the input cap.
fn check_size(bytes: u64) -> Result<(), String> {
    if bytes > MAX_INPUT_BYTES {
        Err(format!(
            "The input image is larger than {} MB.",
            MAX_INPUT_BYTES / MEGABYTE
        ))
    } else {
        Ok(())
    }
}

/// The MIME type of an allowed input image, from its extension (ignoring case). None for any other
/// file.
fn mime_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    INPUT_TYPES
        .iter()
        .find(|(known, _)| *known == extension.as_str())
        .map(|(_, mime)| *mime)
}

/// The bytes of an input image as a `data:` URL, for the preview.
pub(super) fn data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::super::test_support::Scratch;
    use super::*;

    #[test]
    fn each_allowed_extension_has_its_mime_type_ignoring_case() {
        assert_eq!(mime_type(Path::new("a.png")), Some("image/png"));
        assert_eq!(mime_type(Path::new("a.PNG")), Some("image/png"));
        assert_eq!(mime_type(Path::new("a.jpg")), Some("image/jpeg"));
        assert_eq!(mime_type(Path::new("a.JpEg")), Some("image/jpeg"));
        for other in ["a.bmp", "a.webp", "a.gif", "a.gguf", "a", "a.png.txt"] {
            assert_eq!(mime_type(Path::new(other)), None, "{other}");
        }
    }

    #[test]
    fn a_picked_png_or_jpeg_is_accepted_with_its_mime_type() {
        let scratch = Scratch::new("input-accept");
        let png = scratch.path().join("cow.png");
        let jpeg = scratch.path().join("Cow.JPEG");
        fs::write(&png, b"png").expect("png");
        fs::write(&jpeg, b"jpeg").expect("jpeg");

        let accepted = validate_input_image(&png.to_string_lossy()).expect("png");
        assert!(accepted.path.ends_with("cow.png"));
        assert_eq!(accepted.mime, "image/png");

        let accepted = validate_input_image(&jpeg.to_string_lossy()).expect("jpeg");
        assert_eq!(accepted.mime, "image/jpeg");
    }

    #[test]
    fn the_accepted_path_has_no_verbatim_prefix() {
        let scratch = Scratch::new("input-verbatim");
        let png = scratch.path().join("cow.png");
        fs::write(&png, b"png").expect("png");
        let accepted = validate_input_image(&png.to_string_lossy()).expect("png");
        assert!(!accepted.path.to_string_lossy().starts_with(r"\\?\"));
    }

    #[test]
    fn missing_folders_and_other_file_kinds_are_refused() {
        let scratch = Scratch::new("input-refuse");
        let folder = scratch.path().join("looks-like.png");
        fs::create_dir_all(&folder).expect("folder named like a png");
        let gif = scratch.path().join("anim.gif");
        fs::write(&gif, b"gif").expect("gif");
        let bmp = scratch.path().join("dot.bmp");
        fs::write(&bmp, b"BM").expect("bmp");
        let no_extension = scratch.path().join("cow");
        fs::write(&no_extension, b"png").expect("no extension");

        assert!(
            validate_input_image(&scratch.path().join("missing.png").to_string_lossy()).is_err()
        );
        assert!(
            validate_input_image(&folder.to_string_lossy()).is_err(),
            "a folder"
        );
        assert!(
            validate_input_image(&gif.to_string_lossy()).is_err(),
            "a gif"
        );
        assert!(
            validate_input_image(&bmp.to_string_lossy()).is_err(),
            "a bmp"
        );
        assert!(validate_input_image(&no_extension.to_string_lossy()).is_err());
    }

    #[test]
    fn the_size_cap_is_thirty_megabytes_inclusive() {
        assert!(check_size(MAX_INPUT_BYTES).is_ok());
        assert!(check_size(MAX_INPUT_BYTES + 1).is_err());
        let message = check_size(MAX_INPUT_BYTES + 1).expect_err("too large");
        assert!(message.contains("30 MB"), "{message}");
    }

    #[test]
    fn data_url_carries_the_mime_type_and_base64_bytes() {
        assert_eq!(data_url("image/png", b"abc"), "data:image/png;base64,YWJj");
        assert_eq!(data_url("image/jpeg", b""), "data:image/jpeg;base64,");
    }
}
