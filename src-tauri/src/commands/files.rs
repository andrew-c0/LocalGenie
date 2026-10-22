use std::path::Path;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

/// Largest file that can be attached to a system prompt. Bigger files are rejected, not truncated.
pub const MAX_TEXT_FILE_BYTES: u64 = 512 * 1024;

/// Extensions accepted for system prompt attachments.
const TEXT_EXTENSIONS: &[&str] = &["txt", "md"];

/// Open a native file dialog limited to text files. Returns the chosen absolute path, or `None`
/// when the user cancels.
#[tauri::command]
pub async fn pick_text_file(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Text files", TEXT_EXTENSIONS)
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

/// Read a `.txt` or `.md` file as UTF-8 text, for a system prompt attachment.
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || read_checked(Path::new(&path)))
        .await
        .map_err(|e| format!("file read failed: {e}"))?
}

/// Whether a file is still present at this path. Used to warn about moved attachments.
#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).is_file())
}

/// Checks the extension, size and content before reading. Kept separate from the command so it
/// can be tested without a Tauri app.
fn read_checked(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    if !extension
        .as_deref()
        .is_some_and(|e| TEXT_EXTENSIONS.contains(&e))
    {
        return Err("Only .txt and .md files can be attached.".to_string());
    }

    let size = std::fs::metadata(path)
        .map_err(|e| format!("cannot read file: {e}"))?
        .len();
    if size > MAX_TEXT_FILE_BYTES {
        return Err(format!(
            "file is larger than {} KB",
            MAX_TEXT_FILE_BYTES / 1024
        ));
    }

    let bytes = std::fs::read(path).map_err(|e| format!("cannot read file: {e}"))?;
    if bytes.contains(&0) {
        return Err("file looks binary (it contains NUL bytes)".to_string());
    }
    String::from_utf8(bytes).map_err(|_| "file is not valid UTF-8 text".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Writes a file into a fresh temp directory and returns its path.
    fn temp_file(name: &str, contents: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "localgenie-files-test-{}-{}",
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
    fn reads_markdown_and_text_files() {
        let md = temp_file("prompt.md", "# Persona\nBe brief.".as_bytes());
        assert_eq!(read_checked(&md).unwrap(), "# Persona\nBe brief.");
        let txt = temp_file("PROMPT.TXT", b"Plain text");
        assert_eq!(read_checked(&txt).unwrap(), "Plain text");
    }

    #[test]
    fn rejects_other_extensions() {
        let pdf = temp_file("doc.pdf", b"hello");
        assert!(read_checked(&pdf).is_err());
        assert!(read_checked(Path::new("no-extension")).is_err());
    }

    #[test]
    fn rejects_nul_bytes() {
        let bin = temp_file("bad.txt", b"abc\0def");
        assert!(read_checked(&bin).unwrap_err().contains("NUL"));
    }

    #[test]
    fn rejects_oversized_files() {
        let big = temp_file("big.txt", &vec![b'a'; MAX_TEXT_FILE_BYTES as usize + 1]);
        assert!(read_checked(&big).unwrap_err().contains("larger than"));
    }

    #[test]
    fn rejects_invalid_utf8() {
        let bad = temp_file("latin.txt", &[0x66, 0xff, 0x6f]);
        assert!(read_checked(&bad).unwrap_err().contains("UTF-8"));
    }
}
