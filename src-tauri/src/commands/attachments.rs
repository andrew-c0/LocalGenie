use std::collections::HashMap;
use std::path::Path;
use std::sync::{LazyLock, Mutex};
use std::time::UNIX_EPOCH;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, Rgb, RgbImage};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

use super::files::{read_checked, TEXT_EXTENSIONS};

/// Largest image or audio file that can be attached. Bigger files are rejected, not truncated.
pub const MAX_MEDIA_FILE_BYTES: u64 = 10 * 1024 * 1024;

/// Longest side, in pixels, of an image sent to the model. Larger images are scaled down.
pub const MAX_IMAGE_EDGE: u32 = 1536;

/// JPEG quality for a scaled-down image.
const IMAGE_JPEG_QUALITY: u8 = 85;

/// Most scaled images kept in memory. Turns re-read the chat's images, so the cache saves decoding
/// them again on every send. It is cleared when full.
const SCALED_CACHE_ENTRIES: usize = 16;

/// Path, modified time in nanoseconds and size in bytes.
type ScaledKey = (String, u128, u64);

/// Scaled images: base64 data and MIME type, by file key.
static SCALED_IMAGES: LazyLock<Mutex<HashMap<ScaledKey, (String, String)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];
const AUDIO_EXTENSIONS: &[&str] = &["wav", "mp3"];

/// What the user picked from the attach menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AttachmentKind {
    Image,
    Audio,
    Text,
}

impl AttachmentKind {
    fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::Image => IMAGE_EXTENSIONS,
            Self::Audio => AUDIO_EXTENSIONS,
            Self::Text => TEXT_EXTENSIONS,
        }
    }

    fn filter_label(self) -> &'static str {
        match self {
            Self::Image => "Images",
            Self::Audio => "Audio files",
            Self::Text => "Text files",
        }
    }
}

/// A chat attachment as the frontend needs it. Images and audio carry base64 `data` and a `mime`;
/// text files carry `text`. The other field is null.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentFile {
    pub kind: AttachmentKind,
    pub name: String,
    /// Where the file was read from. Previews read it again from here.
    pub path: String,
    pub size: u64,
    pub mime: Option<String>,
    pub data: Option<String>,
    pub text: Option<String>,
}

/// Open a native file dialog limited to the extensions of one attachment kind, or to the subset
/// `extensions` names. Resolves to the chosen path, or null when the user cancels.
#[tauri::command]
pub async fn pick_attachment(
    app: AppHandle,
    kind: AttachmentKind,
    extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    let offered = dialog_extensions(kind, extensions.as_deref().unwrap_or(&[]))?;
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .add_filter(kind.filter_label(), &offered)
        .pick_file(move |picked| {
            let _ = tx.send(picked);
        });
    let picked = rx
        .await
        .map_err(|e| format!("file dialog closed unexpectedly: {e}"))?;
    match picked {
        None => Ok(None),
        Some(file) => file
            .into_path()
            .map(|p| Some(p.to_string_lossy().into_owned()))
            .map_err(|e| format!("selected file has no local path: {e}")),
    }
}

/// Read a file picked for a chat message. The kind comes from the extension.
#[tauri::command]
pub async fn read_attachment(path: String) -> Result<AttachmentFile, String> {
    tokio::task::spawn_blocking(move || read_attachment_file(Path::new(&path)))
        .await
        .map_err(|e| format!("file read failed: {e}"))?
}

/// Open the folder of an attachment in Windows Explorer, with the file selected. Fails when the
/// file is no longer at its path.
#[tauri::command]
pub async fn reveal_attachment(path: String) -> Result<(), String> {
    let file = std::path::PathBuf::from(&path);
    if !file.is_file() {
        return Err(format!("{path} is no longer at this path"));
    }
    reveal_in_explorer(&file)
}

/// `explorer /select,"<file>"` selects the file in its folder. The argument is passed raw: the
/// normal quoting would wrap the whole `/select,...` text and Explorer would not select the file.
/// Explorer may exit with a non-zero code even when it opened, so only the start is checked.
#[cfg(target_os = "windows")]
pub(super) fn reveal_in_explorer(file: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("explorer")
        .raw_arg(format!("/select,\"{}\"", file.display()))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not start Explorer: {e}"))
}

#[cfg(not(target_os = "windows"))]
pub(super) fn reveal_in_explorer(_file: &Path) -> Result<(), String> {
    Err("Opening the file location is only supported on Windows.".to_string())
}

/// The extensions the dialog offers. An empty `requested` list gives the kind's full list. Otherwise
/// each requested extension (ignoring case) must be on the kind's list, or the whole request is
/// refused: a dialog filter never offers a type the command would not accept.
pub(super) fn dialog_extensions(
    kind: AttachmentKind,
    requested: &[String],
) -> Result<Vec<&'static str>, String> {
    if requested.is_empty() {
        return Ok(kind.extensions().to_vec());
    }
    requested
        .iter()
        .map(|wanted| {
            let lower = wanted.to_ascii_lowercase();
            kind.extensions()
                .iter()
                .copied()
                .find(|allowed| *allowed == lower)
                .ok_or_else(|| {
                    format!(
                        "{wanted} is not an allowed extension for {}",
                        kind.filter_label().to_lowercase()
                    )
                })
        })
        .collect()
}

/// The kind an extension belongs to, or None when no attachment kind takes it.
pub(super) fn kind_of_extension(extension: &str) -> Option<AttachmentKind> {
    [
        AttachmentKind::Image,
        AttachmentKind::Audio,
        AttachmentKind::Text,
    ]
    .into_iter()
    .find(|kind| kind.extensions().contains(&extension))
}

/// MIME type sent in the image data URL. Only called for image and audio extensions.
fn mime_for(extension: &str) -> &'static str {
    match extension {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "wav" => "audio/wav",
        _ => "audio/mpeg",
    }
}

/// Checks the kind, size and content, then reads the file. Kept separate from the command so it
/// can be tested without a Tauri app.
pub(super) fn read_attachment_file(path: &Path) -> Result<AttachmentFile, String> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let kind = kind_of_extension(&extension).ok_or_else(|| {
        "Only images (png, jpg, webp), audio (wav, mp3) and text (txt, md) files can be attached."
            .to_string()
    })?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();

    if kind == AttachmentKind::Text {
        let text = read_checked(path)?;
        return Ok(AttachmentFile {
            kind,
            name,
            path: path.to_string_lossy().into_owned(),
            size: text.len() as u64,
            mime: None,
            data: None,
            text: Some(text),
        });
    }

    let size = std::fs::metadata(path)
        .map_err(|e| format!("cannot read file: {e}"))?
        .len();
    if size > MAX_MEDIA_FILE_BYTES {
        return Err(format!(
            "file is larger than {} MB",
            MAX_MEDIA_FILE_BYTES / (1024 * 1024)
        ));
    }
    if kind == AttachmentKind::Image {
        let (data, mime) = image_for_model(path, &extension)?;
        return Ok(AttachmentFile {
            kind,
            name,
            path: path.to_string_lossy().into_owned(),
            size,
            mime: Some(mime),
            data: Some(data),
            text: None,
        });
    }

    let bytes = std::fs::read(path).map_err(|e| format!("cannot read file: {e}"))?;
    Ok(AttachmentFile {
        kind,
        name,
        path: path.to_string_lossy().into_owned(),
        size,
        mime: Some(mime_for(&extension).to_string()),
        data: Some(STANDARD.encode(bytes)),
        text: None,
    })
}

/// Base64 data and MIME type of an image for the model. An image within `MAX_IMAGE_EDGE` keeps its
/// own bytes. A larger one is scaled down and re-encoded as JPEG, since the model's vision encoder
/// works at a much smaller size and the extra pixels only cost decode time on every turn.
fn image_for_model(path: &Path, extension: &str) -> Result<(String, String), String> {
    // An unreadable header is passed through unchanged, as before: the server reports bad images.
    let needs_scaling =
        matches!(image::image_dimensions(path), Ok((w, h)) if w.max(h) > MAX_IMAGE_EDGE);
    if !needs_scaling {
        let bytes = std::fs::read(path).map_err(|e| format!("cannot read file: {e}"))?;
        return Ok((STANDARD.encode(bytes), mime_for(extension).to_string()));
    }

    let key = scaled_key(path)?;
    if let Some(hit) = scaled_cache().get(&key) {
        return Ok(hit.clone());
    }
    let decoded = image::open(path).map_err(|e| format!("could not read image: {e}"))?;
    let scaled = decoded.resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, FilterType::Lanczos3);
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, IMAGE_JPEG_QUALITY)
        .encode_image(&opaque_rgb(&scaled))
        .map_err(|e| format!("could not encode image: {e}"))?;
    let result = (STANDARD.encode(jpeg), "image/jpeg".to_string());

    let mut cache = scaled_cache();
    if cache.len() >= SCALED_CACHE_ENTRIES {
        cache.clear();
    }
    cache.insert(key, result.clone());
    Ok(result)
}

/// Flattens transparency onto white, since JPEG has no alpha channel.
fn opaque_rgb(img: &DynamicImage) -> RgbImage {
    let rgba = img.to_rgba8();
    let mut out = RgbImage::from_pixel(rgba.width(), rgba.height(), Rgb([255, 255, 255]));
    for (x, y, pixel) in rgba.enumerate_pixels() {
        let alpha = u32::from(pixel[3]);
        let blend = |channel: u8| ((u32::from(channel) * alpha + 255 * (255 - alpha)) / 255) as u8;
        out.put_pixel(
            x,
            y,
            Rgb([blend(pixel[0]), blend(pixel[1]), blend(pixel[2])]),
        );
    }
    out
}

/// Cache key for a scaled image: the path, plus its modified time and size, so an edited file is
/// scaled again.
fn scaled_key(path: &Path) -> Result<ScaledKey, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("cannot read file: {e}"))?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    Ok((path.to_string_lossy().into_owned(), modified, meta.len()))
}

fn scaled_cache() -> std::sync::MutexGuard<'static, HashMap<ScaledKey, (String, String)>> {
    // A poisoned lock only means an earlier scaling panicked; the map is still usable.
    SCALED_IMAGES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Writes a file into a fresh temp directory and returns its path.
    fn temp_file(name: &str, contents: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "localgenie-attach-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join(name);
        std::fs::write(&path, contents).expect("write temp file");
        path
    }

    #[test]
    fn extensions_map_to_one_kind_each() {
        assert_eq!(kind_of_extension("png"), Some(AttachmentKind::Image));
        assert_eq!(kind_of_extension("webp"), Some(AttachmentKind::Image));
        assert_eq!(kind_of_extension("mp3"), Some(AttachmentKind::Audio));
        assert_eq!(kind_of_extension("md"), Some(AttachmentKind::Text));
        assert_eq!(kind_of_extension("pdf"), None);
    }

    #[test]
    fn image_is_base64_with_its_mime() {
        let png = temp_file("dot.PNG", &[0x89, 0x50, 0x4e, 0x47]);
        let file = read_attachment_file(&png).expect("image reads");
        assert_eq!(file.kind, AttachmentKind::Image);
        assert_eq!(file.name, "dot.PNG");
        assert_eq!(file.size, 4);
        assert_eq!(file.mime.as_deref(), Some("image/png"));
        assert_eq!(file.path, png.to_string_lossy());
        assert_eq!(
            STANDARD.decode(file.data.expect("data")).expect("base64"),
            vec![0x89, 0x50, 0x4e, 0x47]
        );
        assert!(file.text.is_none());
    }

    #[test]
    fn audio_reports_its_mime() {
        let wav = temp_file("clip.wav", b"RIFF");
        let file = read_attachment_file(&wav).expect("audio reads");
        assert_eq!(file.kind, AttachmentKind::Audio);
        assert_eq!(file.mime.as_deref(), Some("audio/wav"));
        let mp3 = temp_file("clip.mp3", b"ID3");
        assert_eq!(
            read_attachment_file(&mp3)
                .expect("mp3 reads")
                .mime
                .as_deref(),
            Some("audio/mpeg")
        );
    }

    #[test]
    fn text_is_returned_as_text() {
        let md = temp_file("notes.md", "# Notes".as_bytes());
        let file = read_attachment_file(&md).expect("text reads");
        assert_eq!(file.kind, AttachmentKind::Text);
        assert_eq!(file.text.as_deref(), Some("# Notes"));
        assert!(file.data.is_none());
    }

    #[test]
    fn rejects_unsupported_extensions() {
        let pdf = temp_file("doc.pdf", b"%PDF");
        assert!(read_attachment_file(&pdf).is_err());
        assert!(read_attachment_file(Path::new("no-extension")).is_err());
    }

    #[test]
    fn rejects_oversized_media() {
        let big = temp_file("big.png", &vec![0u8; MAX_MEDIA_FILE_BYTES as usize + 1]);
        assert!(read_attachment_file(&big)
            .unwrap_err()
            .contains("larger than"));
    }

    /// Decodes the base64 data of an attachment back into an image.
    fn decoded(file: &AttachmentFile) -> DynamicImage {
        let bytes = STANDARD
            .decode(file.data.as_deref().expect("data"))
            .expect("base64");
        image::load_from_memory(&bytes).expect("image decodes")
    }

    #[test]
    fn small_image_keeps_its_own_bytes() {
        let dir = std::env::temp_dir().join(format!("localgenie-small-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("small.png");
        RgbImage::from_pixel(120, 80, Rgb([10, 200, 30]))
            .save(&path)
            .expect("write png");
        let original = std::fs::read(&path).expect("read back");

        let file = read_attachment_file(&path).expect("image reads");
        assert_eq!(file.mime.as_deref(), Some("image/png"));
        assert_eq!(
            STANDARD.decode(file.data.expect("data")).expect("base64"),
            original
        );
    }

    #[test]
    fn large_image_is_scaled_to_the_edge_limit_as_jpeg() {
        let dir = std::env::temp_dir().join(format!("localgenie-large-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("large.png");
        RgbImage::from_pixel(1600, 1000, Rgb([120, 60, 200]))
            .save(&path)
            .expect("write png");

        let file = read_attachment_file(&path).expect("image reads");
        assert_eq!(file.mime.as_deref(), Some("image/jpeg"));
        assert_eq!(file.size, std::fs::metadata(&path).expect("meta").len());
        let image = decoded(&file);
        assert_eq!((image.width(), image.height()), (1536, 960));
    }

    #[test]
    fn transparent_pixels_become_white_when_scaled() {
        let dir = std::env::temp_dir().join(format!("localgenie-alpha-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("alpha.png");
        image::RgbaImage::from_pixel(1600, 800, image::Rgba([0, 0, 0, 0]))
            .save(&path)
            .expect("write png");

        let file = read_attachment_file(&path).expect("image reads");
        let pixel = decoded(&file).to_rgb8().get_pixel(10, 10).0;
        assert!(
            pixel.iter().all(|&c| c > 240),
            "expected white, got {pixel:?}"
        );
    }

    #[test]
    fn dialog_offers_the_full_kind_list_when_no_extensions_are_asked() {
        assert_eq!(
            dialog_extensions(AttachmentKind::Image, &[]).expect("image"),
            IMAGE_EXTENSIONS
        );
        assert_eq!(
            dialog_extensions(AttachmentKind::Audio, &[]).expect("audio"),
            AUDIO_EXTENSIONS
        );
    }

    #[test]
    fn dialog_narrows_to_the_asked_extensions_in_any_case() {
        let asked = ["png", "JPG", "jpeg"].map(String::from);
        assert_eq!(
            dialog_extensions(AttachmentKind::Image, &asked).expect("image subset"),
            vec!["png", "jpg", "jpeg"]
        );
        let wav = ["WAV".to_string()];
        assert_eq!(
            dialog_extensions(AttachmentKind::Audio, &wav).expect("audio subset"),
            vec!["wav"]
        );
    }

    #[test]
    fn dialog_refuses_an_extension_outside_the_kind() {
        let mixed = ["png".to_string(), "mp3".to_string()];
        assert!(dialog_extensions(AttachmentKind::Image, &mixed).is_err());
        let bmp = ["bmp".to_string()];
        let error = dialog_extensions(AttachmentKind::Image, &bmp).expect_err("bmp");
        assert!(error.contains("bmp"), "{error}");
        let wav = ["wav".to_string()];
        assert!(dialog_extensions(AttachmentKind::Image, &wav).is_err());
        assert!(dialog_extensions(AttachmentKind::Text, &wav).is_err());
    }

    #[test]
    fn kind_uses_the_frontend_names() {
        assert_eq!(
            serde_json::to_string(&AttachmentKind::Audio).expect("serialize"),
            "\"audio\""
        );
        let parsed: AttachmentKind = serde_json::from_str("\"image\"").expect("parse");
        assert_eq!(parsed, AttachmentKind::Image);
    }
}
