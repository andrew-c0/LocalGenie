use super::limits::{IMAGE_MAX_BYTES, LIST_MAX_ENTRIES, READ_MAX_BYTES};
use super::output::capped_output;
use super::paths::{display_path, is_hidden_or_system};
use super::{ToolAttachment, ToolOutput};
use std::io::Read;
use std::path::{Path, PathBuf};

const NOT_TEXT: &str = "not a text file";
const EMPTY_FILE: &str = "(empty file)";
const EMPTY_FOLDER: &str = "The folder is empty.";
const ALLOWED_HEADER: &str = "These are the folders you may read.";
const FOLDER_NOT_FILE: &str = "This path is a folder. Use list_directory for folders.";
const NOT_A_FILE: &str = "This path is not a regular file";
const IS_IMAGE: &str = "This is an image. Use read_image to look at it.";
const UNSUPPORTED_IMAGE: &str =
    "This is not a supported image. Supported: png, jpg, jpeg, gif, webp.";
/// Bytes read from the start of an image to check its signature. WebP needs the first 12.
const SIGNATURE_BYTES: u64 = 12;

/// One entry of a folder listing.
struct Entry {
    name: String,
    is_folder: bool,
    size: u64,
}

/// List a folder: folders first, then by name. Hidden and system entries are skipped. The first
/// line counts the folders and files; at most `LIST_MAX_ENTRIES` entries follow, then an
/// "and N more" line when some are cut.
pub(super) fn list_directory(folder: &Path) -> Result<ToolOutput, String> {
    if !folder.is_dir() {
        return Err("This path is not a folder".into());
    }
    let mut entries = read_entries(folder)?;
    entries.sort_by(|a, b| {
        b.is_folder
            .cmp(&a.is_folder)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    if entries.is_empty() {
        return Ok(ToolOutput {
            content: EMPTY_FOLDER.into(),
            truncated: false,
            attachment: None,
        });
    }

    let total = entries.len();
    let mut lines = vec![summary_line(&entries)];
    lines.extend(entries.iter().take(LIST_MAX_ENTRIES).map(format_entry));
    let cut = total > LIST_MAX_ENTRIES;
    if cut {
        lines.push(format!("and {} more", total - LIST_MAX_ENTRIES));
    }
    Ok(capped_output(&lines.join("\n"), cut))
}

/// The folders the user allowed, one `folder  <path>` line each, under a short header.
pub(super) fn list_allowed_folders(folders: &[PathBuf]) -> ToolOutput {
    let mut lines = vec![ALLOWED_HEADER.to_string()];
    lines.extend(
        folders
            .iter()
            .map(|folder| format!("folder  {}", display_path(folder))),
    );
    capped_output(&lines.join("\n"), false)
}

/// Read a text file. Folders, files over `READ_MAX_BYTES`, binary and non-UTF-8 files are refused.
/// A UTF-8 byte order mark is dropped.
pub(super) fn read_text_file(file: &Path) -> Result<ToolOutput, String> {
    if file.is_dir() {
        return Err(FOLDER_NOT_FILE.into());
    }
    if image_mime(&lowercase_extension(file)).is_some() {
        return Err(IS_IMAGE.into());
    }
    let metadata = std::fs::metadata(file).map_err(|e| format!("Could not read the file: {e}"))?;
    if !metadata.is_file() {
        return Err(NOT_A_FILE.into());
    }
    if metadata.len() > READ_MAX_BYTES {
        return Err(format!(
            "The file is too large to read, {} bytes. The limit is 1 MiB.",
            metadata.len()
        ));
    }
    let bytes = std::fs::read(file).map_err(|e| format!("Could not read the file: {e}"))?;
    let text = decode_text(&bytes)?;
    if text.is_empty() {
        return Ok(ToolOutput {
            content: EMPTY_FILE.into(),
            truncated: false,
            attachment: None,
        });
    }
    Ok(capped_output(text, false))
}

/// Check an image and hand it on as an attachment. `file` must already be canonical, as
/// `paths::resolve_allowed` returns it. The image is refused when it is a folder, not a regular
/// file, not a supported type, over `IMAGE_MAX_BYTES`, or its bytes do not match its extension.
pub(super) fn read_image(file: &Path) -> Result<ToolOutput, String> {
    if file.is_dir() {
        return Err(FOLDER_NOT_FILE.into());
    }
    let metadata = std::fs::metadata(file).map_err(|e| format!("Could not read the file: {e}"))?;
    if !metadata.is_file() {
        return Err(NOT_A_FILE.into());
    }
    let extension = lowercase_extension(file);
    let mime = image_mime(&extension).ok_or_else(|| UNSUPPORTED_IMAGE.to_string())?;
    let size = metadata.len();
    if size > IMAGE_MAX_BYTES {
        return Err(format!(
            "The image is too large, {size} bytes ({}). The limit is 5 MiB.",
            format_size(size)
        ));
    }
    let header = read_header(file)?;
    if !has_image_signature(&extension, &header) {
        return Err(format!("The file content is not a valid {extension} image"));
    }
    let name = file
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(ToolOutput {
        content: format!(
            "Image {name}, {mime}, {}. It is attached below.",
            format_size(size)
        ),
        truncated: false,
        attachment: Some(ToolAttachment {
            path: display_path(file),
            name,
            mime: mime.into(),
        }),
    })
}

/// The first line of a listing: how many folders and files it holds, counted before any cap.
fn summary_line(entries: &[Entry]) -> String {
    let folders = entries.iter().filter(|entry| entry.is_folder).count();
    let files = entries.iter().filter(|entry| !entry.is_folder).count();
    format!(
        "Contains {} and {}.",
        count_noun(folders, "folder"),
        count_noun(files, "file")
    )
}

/// `1 file`, `3 files`, `0 folders`.
fn count_noun(count: usize, noun: &str) -> String {
    if count == 1 {
        format!("1 {noun}")
    } else {
        format!("{count} {noun}s")
    }
}

/// The entries of a folder that the user may see. Entries that cannot be read are skipped.
fn read_entries(folder: &Path) -> Result<Vec<Entry>, String> {
    let reader =
        std::fs::read_dir(folder).map_err(|e| format!("Could not read the folder: {e}"))?;
    Ok(reader
        .filter_map(Result::ok)
        .filter_map(|entry| entry_info(&entry))
        .collect())
}

/// Name, kind and size of one entry, or `None` when it is hidden, system or unreadable.
fn entry_info(entry: &std::fs::DirEntry) -> Option<Entry> {
    let metadata = std::fs::metadata(entry.path()).ok()?;
    if is_hidden_or_system(&metadata) {
        return None;
    }
    Some(Entry {
        name: entry.file_name().to_string_lossy().into_owned(),
        is_folder: metadata.is_dir(),
        size: metadata.len(),
    })
}

/// One listing line: `folder  Documents` or `file  notes.txt  1.2 KB`.
fn format_entry(entry: &Entry) -> String {
    if entry.is_folder {
        format!("folder  {}", entry.name)
    } else {
        format!("file  {}  {}", entry.name, format_size(entry.size))
    }
}

/// A byte count for people: `812 B`, `1.2 KB`, `3.4 MB`.
fn format_size(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["KB", "MB", "GB", "TB"];
    if bytes < 1024 {
        return format!("{bytes} B");
    }
    let mut value = bytes as f64 / 1024.0;
    let mut unit = 0;
    while value >= 1024.0 && unit + 1 < UNITS.len() {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}

/// The text of a file without its BOM, or `NOT_TEXT` for binary or non-UTF-8 bytes.
fn decode_text(bytes: &[u8]) -> Result<&str, String> {
    if bytes.contains(&0) {
        return Err(NOT_TEXT.into());
    }
    let text = std::str::from_utf8(bytes).map_err(|_| NOT_TEXT.to_string())?;
    Ok(text.strip_prefix('\u{feff}').unwrap_or(text))
}

/// The extension of `file` in lowercase, or an empty string when it has none.
fn lowercase_extension(file: &Path) -> String {
    file.extension()
        .map(|extension| extension.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

/// The MIME type of a supported image extension (lowercase), or `None` for any other.
fn image_mime(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// The first bytes of a file, enough to check its signature.
fn read_header(file: &Path) -> Result<Vec<u8>, String> {
    let handle = std::fs::File::open(file).map_err(|e| format!("Could not read the file: {e}"))?;
    let mut header = Vec::new();
    handle
        .take(SIGNATURE_BYTES)
        .read_to_end(&mut header)
        .map_err(|e| format!("Could not read the file: {e}"))?;
    Ok(header)
}

/// Whether the first bytes of a file match the signature of its (lowercase) image extension.
fn has_image_signature(extension: &str, header: &[u8]) -> bool {
    match extension {
        "png" => header.starts_with(&[0x89, b'P', b'N', b'G']),
        "jpg" | "jpeg" => header.starts_with(&[0xFF, 0xD8, 0xFF]),
        "gif" => header.starts_with(b"GIF8"),
        "webp" => header.starts_with(b"RIFF") && header.get(8..12) == Some(&b"WEBP"[..]),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::{format_size, list_allowed_folders, list_directory, read_image, read_text_file};
    use crate::commands::tools::limits::{
        CONTENT_MAX_CHARS, IMAGE_MAX_BYTES, LIST_MAX_ENTRIES, READ_MAX_BYTES,
    };
    use crate::commands::tools::output::capped_output;
    use crate::commands::tools::paths::display_path;
    use crate::commands::tools::test_support::TempTree;

    const PNG_HEADER: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
    const JPEG_HEADER: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, b'J', b'F', b'I', b'F'];
    const GIF_HEADER: &[u8] = b"GIF89a\x01\x00\x01\x00";
    const WEBP_HEADER: &[u8] = b"RIFF\x1A\x00\x00\x00WEBPVP8 ";

    fn names_in_order(content: &str) -> Vec<&str> {
        content.lines().collect()
    }

    /// Image bytes of `size` bytes that start with `header`.
    fn image_bytes(header: &[u8], size: usize) -> Vec<u8> {
        let mut bytes = header.to_vec();
        bytes.resize(size, b'a');
        bytes
    }

    #[test]
    fn list_puts_folders_first_then_names_in_order() {
        let tree = TempTree::new("list-order");
        tree.file("b.txt", b"12");
        tree.file("A.txt", b"12345678901");
        tree.folder("zeta");
        tree.folder("alpha");

        let output = list_directory(tree.path()).expect("list");
        assert_eq!(
            names_in_order(&output.content),
            [
                "Contains 2 folders and 2 files.",
                "folder  alpha",
                "folder  zeta",
                "file  A.txt  11 B",
                "file  b.txt  2 B"
            ]
        );
        assert!(!output.truncated);
    }

    #[test]
    fn list_summary_counts_folders_and_files() {
        let tree = TempTree::new("list-counts");
        tree.folder("one");
        tree.folder("two");
        tree.file("a.txt", b"x");
        tree.file("b.txt", b"x");
        tree.file("c.txt", b"x");

        let output = list_directory(tree.path()).expect("list");
        assert!(output.content.starts_with("Contains 2 folders and 3 files.\n"));
    }

    #[test]
    fn list_summary_uses_the_singular_for_one() {
        let tree = TempTree::new("list-singular");
        tree.folder("only");
        tree.file("only.txt", b"x");

        let output = list_directory(tree.path()).expect("list");
        assert_eq!(
            names_in_order(&output.content)[0],
            "Contains 1 folder and 1 file."
        );
    }

    #[test]
    fn list_summary_says_zero_for_a_kind_that_is_absent() {
        let tree = TempTree::new("list-zero");
        tree.file("a.txt", b"x");
        tree.file("b.txt", b"x");

        let output = list_directory(tree.path()).expect("list");
        assert_eq!(
            names_in_order(&output.content)[0],
            "Contains 0 folders and 2 files."
        );
    }

    #[test]
    fn list_summary_counts_the_entries_the_cap_hides() {
        let tree = TempTree::new("list-cap-counts");
        for index in 0..3 {
            tree.folder(&format!("dir{index}"));
        }
        for index in 0..LIST_MAX_ENTRIES + 2 {
            tree.file(&format!("f{index:03}.txt"), b"x");
        }

        let output = list_directory(tree.path()).expect("list");
        let lines = names_in_order(&output.content);
        assert_eq!(lines.len(), LIST_MAX_ENTRIES + 2);
        assert_eq!(lines[0], "Contains 3 folders and 202 files.");
        assert_eq!(lines.last().copied(), Some("and 5 more"));
        assert!(output.truncated);
    }

    #[test]
    fn list_caps_the_entries_and_counts_the_rest() {
        let tree = TempTree::new("list-cap");
        let total = LIST_MAX_ENTRIES + 5;
        for index in 0..total {
            tree.file(&format!("f{index:03}.txt"), b"x");
        }

        let output = list_directory(tree.path()).expect("list");
        let lines = names_in_order(&output.content);
        assert_eq!(lines.len(), LIST_MAX_ENTRIES + 2);
        assert_eq!(lines[0], format!("Contains 0 folders and {total} files."));
        assert_eq!(lines.last().copied(), Some("and 5 more"));
        assert!(output.truncated);
    }

    #[test]
    fn list_of_an_empty_folder_says_so() {
        let tree = TempTree::new("list-empty");
        let output = list_directory(tree.path()).expect("list");
        assert_eq!(output.content, "The folder is empty.");
    }

    #[test]
    fn list_of_the_allowed_folders_has_a_header_and_one_line_each() {
        let tree = TempTree::new("list-allowed");
        let first = tree.folder("first");
        let second = tree.folder("second");

        let output = list_allowed_folders(&[first.clone(), second.clone()]);
        assert_eq!(
            output.content,
            format!(
                "These are the folders you may read.\nfolder  {}\nfolder  {}",
                display_path(&first),
                display_path(&second)
            )
        );
        assert!(!output.truncated);
        assert!(output.attachment.is_none());
    }

    #[cfg(windows)]
    #[test]
    fn list_skips_hidden_entries() {
        let tree = TempTree::new("list-hidden");
        tree.file("visible.txt", b"x");
        let hidden = tree.file("hidden.txt", b"x");
        let set = std::process::Command::new("attrib")
            .arg("+h")
            .arg(&hidden)
            .status()
            .is_ok_and(|status| status.success());
        if !set {
            return;
        }
        let output = list_directory(tree.path()).expect("list");
        assert!(output.content.contains("visible.txt"));
        assert!(!output.content.contains("hidden.txt"));
        assert!(output.content.starts_with("Contains 0 folders and 1 file."));
    }

    #[test]
    fn list_refuses_a_file_path() {
        let tree = TempTree::new("list-file");
        let file = tree.file("notes.txt", b"x");
        assert!(list_directory(&file).is_err());
    }

    #[test]
    fn reads_a_small_text_file() {
        let tree = TempTree::new("read-small");
        let file = tree.file("notes.txt", "hello there".as_bytes());
        let output = read_text_file(&file).expect("read");
        assert_eq!(output.content, "hello there");
        assert!(!output.truncated);
    }

    #[test]
    fn reads_an_empty_file_as_a_marker() {
        let tree = TempTree::new("read-empty");
        let file = tree.file("empty.txt", b"");
        let output = read_text_file(&file).expect("read");
        assert_eq!(output.content, "(empty file)");
    }

    #[test]
    fn long_text_is_cut_on_a_character_boundary_and_marked() {
        let tree = TempTree::new("read-long");
        let text = "é".repeat(CONTENT_MAX_CHARS + 500);
        let file = tree.file("long.txt", text.as_bytes());

        let output = read_text_file(&file).expect("read");
        assert!(output.truncated);
        let note = format!(
            "\n[truncated: showing {CONTENT_MAX_CHARS} of {} characters]",
            CONTENT_MAX_CHARS + 500
        );
        let body = output.content.strip_suffix(&note).expect("final note");
        assert_eq!(body.chars().count(), CONTENT_MAX_CHARS);
        assert!(body.chars().all(|c| c == 'é'));
    }

    #[test]
    fn capped_output_keeps_short_text_whole() {
        let output = capped_output("short", false);
        assert_eq!(output.content, "short");
        assert!(!output.truncated);
    }

    #[test]
    fn binary_file_is_refused() {
        let tree = TempTree::new("read-binary");
        let file = tree.file("image.bin", &[0x89, b'P', b'N', b'G', 0, 1, 2]);
        assert_eq!(read_text_file(&file).unwrap_err(), "not a text file");
    }

    #[test]
    fn non_utf8_file_is_refused() {
        let tree = TempTree::new("read-latin1");
        let file = tree.file("latin.txt", &[0x63, 0x61, 0x66, 0xe9]);
        assert_eq!(read_text_file(&file).unwrap_err(), "not a text file");
    }

    #[test]
    fn oversized_file_is_refused_with_its_size() {
        let tree = TempTree::new("read-large");
        let size = READ_MAX_BYTES as usize + 1;
        let file = tree.file("big.txt", &vec![b'a'; size]);
        let error = read_text_file(&file).unwrap_err();
        assert!(error.contains("too large to read"), "{error}");
        assert!(error.contains(&size.to_string()), "{error}");
    }

    #[test]
    fn utf8_byte_order_mark_is_dropped() {
        let tree = TempTree::new("read-bom");
        let file = tree.file("bom.txt", b"\xEF\xBB\xBFhi");
        let output = read_text_file(&file).expect("read");
        assert_eq!(output.content, "hi");
    }

    #[test]
    fn reading_a_folder_is_refused() {
        let tree = TempTree::new("read-folder");
        let folder = tree.folder("docs");
        assert!(read_text_file(&folder).is_err());
    }

    #[test]
    fn reading_an_image_points_to_read_image() {
        let tree = TempTree::new("read-image");
        let file = tree.file("photo.PNG", PNG_HEADER);
        assert_eq!(
            read_text_file(&file).unwrap_err(),
            "This is an image. Use read_image to look at it."
        );
    }

    #[test]
    fn each_supported_image_type_is_attached() {
        let tree = TempTree::new("image-types");
        let cases: [(&str, &[u8], &str); 5] = [
            ("a.png", PNG_HEADER, "image/png"),
            ("b.JPG", JPEG_HEADER, "image/jpeg"),
            ("c.jpeg", JPEG_HEADER, "image/jpeg"),
            ("d.gif", GIF_HEADER, "image/gif"),
            ("e.webp", WEBP_HEADER, "image/webp"),
        ];
        for (name, header, mime) in cases {
            let file = tree.file(name, header);
            let canonical = std::fs::canonicalize(&file).expect("canonical");
            let output = read_image(&canonical).expect(name);

            let size = format_size(header.len() as u64);
            assert_eq!(
                output.content,
                format!("Image {name}, {mime}, {size}. It is attached below.")
            );
            assert!(!output.truncated);
            let attachment = output.attachment.expect("an attachment");
            assert_eq!(attachment.name, name);
            assert_eq!(attachment.mime, mime);
            assert_eq!(attachment.path, display_path(&canonical));
            assert!(!attachment.path.starts_with(r"\\?\"), "{}", attachment.path);
        }
    }

    #[test]
    fn image_with_the_wrong_signature_is_refused() {
        let tree = TempTree::new("image-magic");
        let file = tree.file("fake.png", GIF_HEADER);
        assert_eq!(
            read_image(&file).unwrap_err(),
            "The file content is not a valid png image"
        );
    }

    #[test]
    fn webp_without_the_webp_tag_is_refused() {
        let tree = TempTree::new("image-webp");
        let file = tree.file("wave.webp", b"RIFF\x1A\x00\x00\x00WAVEfmt ");
        assert_eq!(
            read_image(&file).unwrap_err(),
            "The file content is not a valid webp image"
        );
    }

    #[test]
    fn image_over_the_limit_is_refused_with_its_size() {
        let tree = TempTree::new("image-large");
        let size = IMAGE_MAX_BYTES as usize + 1;
        let file = tree.file("big.png", &image_bytes(PNG_HEADER, size));
        let error = read_image(&file).unwrap_err();
        assert!(error.contains("too large"), "{error}");
        assert!(error.contains(&size.to_string()), "{error}");
        assert!(error.contains("The limit is 5 MiB."), "{error}");
    }

    #[test]
    fn image_with_another_extension_is_refused() {
        let tree = TempTree::new("image-ext");
        let bitmap = tree.file("photo.bmp", PNG_HEADER);
        let text = tree.file("notes.txt", PNG_HEADER);
        for file in [bitmap, text] {
            assert_eq!(
                read_image(&file).unwrap_err(),
                "This is not a supported image. Supported: png, jpg, jpeg, gif, webp."
            );
        }
    }

    #[test]
    fn image_folder_is_refused() {
        let tree = TempTree::new("image-folder");
        let folder = tree.folder("pictures.png");
        assert!(read_image(&folder).is_err());
    }

    #[test]
    fn sizes_use_bytes_then_kilobytes_and_up() {
        assert_eq!(format_size(0), "0 B");
        assert_eq!(format_size(1023), "1023 B");
        assert_eq!(format_size(1024), "1.0 KB");
        assert_eq!(format_size(1536), "1.5 KB");
        assert_eq!(format_size(3 * 1024 * 1024), "3.0 MB");
    }
}
