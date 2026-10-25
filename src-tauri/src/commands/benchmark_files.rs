use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait,
    PaginatorTrait, QueryFilter, Set,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};

use super::attachments::{kind_of_extension, AttachmentKind, MAX_MEDIA_FILE_BYTES};
use super::files::read_checked;
use crate::entities::{benchmark_file, benchmark_prompt_file, benchmark_step_file};

/// Folder under the app data directory where benchmark files are copied. One sub-folder per file id.
pub const STORE_DIR: &str = "benchmark-files";

/// A library file as the frontend shows it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkFileDto {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub size: Option<i64>,
    pub chars: Option<i64>,
    pub stored_path: String,
    pub sha256: String,
    pub created_at: i64,
}

impl From<benchmark_file::Model> for BenchmarkFileDto {
    fn from(m: benchmark_file::Model) -> Self {
        Self {
            id: m.id,
            name: m.name,
            kind: m.kind,
            size: m.size,
            chars: m.chars,
            stored_path: m.stored_path,
            sha256: m.sha256,
            created_at: m.created_at,
        }
    }
}

/// Where benchmark files are copied to, under the app data directory.
pub fn store_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join(STORE_DIR))
        .map_err(|e| format!("app data folder unavailable: {e}"))
}

/// Copy a file into the library, as `<id>/<name>` under the store root. The copy is what the
/// benchmark reads, so moving or deleting the original does not affect later runs.
#[tauri::command]
pub async fn import_benchmark_file(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    path: String,
    id: String,
) -> Result<BenchmarkFileDto, String> {
    let root = store_root(&app)?;
    import_file(&db, &root, &path, &id).await
}

/// Remove a file that is no longer used by any prompt or step. Used when the editor is cancelled
/// after importing a file. A file still in use is left alone.
#[tauri::command]
pub async fn discard_benchmark_file(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    id: String,
) -> Result<(), String> {
    let root = store_root(&app)?;
    remove_if_unreferenced(&*db, &root, std::slice::from_ref(&id)).await
}

/// Import a file into the library. Testable core of `import_benchmark_file`.
pub async fn import_file(
    db: &DatabaseConnection,
    root: &Path,
    path: &str,
    id: &str,
) -> Result<BenchmarkFileDto, String> {
    if id.trim().is_empty() {
        return Err("A file id is required.".to_string());
    }
    if benchmark_file::Entity::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err("This file is already in the library.".to_string());
    }

    let src = PathBuf::from(path);
    let dir = root.join(id);
    let staged = {
        let src = src.clone();
        let dir = dir.clone();
        tokio::task::spawn_blocking(move || stage_file(&src, &dir))
            .await
            .map_err(|e| format!("file copy failed: {e}"))??
    };

    let now = now_millis();
    let inserted = benchmark_file::ActiveModel {
        id: Set(id.to_string()),
        name: Set(staged.name.clone()),
        kind: Set(kind_name(staged.kind).to_string()),
        size: Set(Some(staged.size as i64)),
        chars: Set(staged.chars),
        stored_path: Set(staged.stored_path.clone()),
        sha256: Set(staged.sha256.clone()),
        created_at: Set(now),
    }
    .insert(db)
    .await;

    match inserted {
        Ok(model) => Ok(model.into()),
        Err(e) => {
            // Do not leave a copy the library does not know about.
            let _ = fs::remove_dir_all(&dir);
            Err(format!("could not save the file: {e}"))
        }
    }
}

/// What the copy step produced: everything the library row needs.
struct Staged {
    kind: AttachmentKind,
    name: String,
    size: u64,
    chars: Option<i64>,
    stored_path: String,
    sha256: String,
}

/// Check the file, copy it into `dir` and hash the copy. Blocking: call from `spawn_blocking`.
fn stage_file(src: &Path, dir: &Path) -> Result<Staged, String> {
    let extension = src
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let kind = kind_of_extension(&extension).ok_or_else(|| {
        "Only images (png, jpg, webp), audio (wav, mp3) and text (txt, md) files can be added."
            .to_string()
    })?;
    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| "The file has no name.".to_string())?;

    let chars = if kind == AttachmentKind::Text {
        // Same size and encoding rules as the chat's text attachments.
        let text = read_checked(src)?;
        Some(text.chars().count() as i64)
    } else {
        let len = fs::metadata(src)
            .map_err(|e| format!("cannot read file: {e}"))?
            .len();
        if len > MAX_MEDIA_FILE_BYTES {
            return Err("This file is too large. Media files can be at most 10 MB.".to_string());
        }
        None
    };

    fs::create_dir_all(dir).map_err(|e| format!("cannot create the benchmark folder: {e}"))?;
    let dest = dir.join(&name);
    let size = fs::copy(src, &dest).map_err(|e| {
        let _ = fs::remove_dir_all(dir);
        format!("cannot copy the file: {e}")
    })?;
    let sha256 = sha256_of(&dest).inspect_err(|_| {
        let _ = fs::remove_dir_all(dir);
    })?;

    Ok(Staged {
        kind,
        name,
        size,
        chars,
        stored_path: dest.to_string_lossy().into_owned(),
        sha256,
    })
}

fn sha256_of(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("cannot read the copy: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buf)
            .map_err(|e| format!("cannot read the copy: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// The value stored in `benchmark_files.kind`.
pub fn kind_name(kind: AttachmentKind) -> &'static str {
    match kind {
        AttachmentKind::Image => "image",
        AttachmentKind::Audio => "audio",
        AttachmentKind::Text => "text",
    }
}

/// The library rows for `ids`, in the same order. A missing row means a broken link, which the
/// restrict foreign keys should prevent, so it is reported rather than skipped.
pub async fn load_files<C: ConnectionTrait>(
    db: &C,
    ids: &[String],
) -> Result<Vec<BenchmarkFileDto>, String> {
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        let row = benchmark_file::Entity::find_by_id(id.as_str())
            .one(db)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("benchmark file {id} is missing"))?;
        out.push(row.into());
    }
    Ok(out)
}

/// True while any prompt or suite step uses the file.
pub async fn is_referenced<C: ConnectionTrait>(db: &C, id: &str) -> Result<bool, String> {
    let in_prompts = benchmark_prompt_file::Entity::find()
        .filter(benchmark_prompt_file::Column::FileId.eq(id))
        .count(db)
        .await
        .map_err(|e| e.to_string())?;
    if in_prompts > 0 {
        return Ok(true);
    }
    let in_steps = benchmark_step_file::Entity::find()
        .filter(benchmark_step_file::Column::FileId.eq(id))
        .count(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(in_steps > 0)
}

/// Delete the row and the copied folder for each id that nothing references any more.
pub async fn remove_if_unreferenced<C: ConnectionTrait>(
    db: &C,
    root: &Path,
    ids: &[String],
) -> Result<(), String> {
    for id in ids {
        if is_referenced(db, id).await? {
            continue;
        }
        benchmark_file::Entity::delete_by_id(id.as_str())
            .exec(db)
            .await
            .map_err(|e| e.to_string())?;
        remove_folder(&root.join(id))?;
    }
    Ok(())
}

/// Startup clean-up: remove library rows that nothing uses, and copied folders with no row.
/// Returns how many files or folders were removed. Only called at startup, so it cannot race
/// with an import that has not been saved yet.
pub async fn sweep_orphans(db: &DatabaseConnection, root: &Path) -> Result<usize, String> {
    let mut removed = 0;
    let rows = benchmark_file::Entity::find()
        .all(db)
        .await
        .map_err(|e| e.to_string())?;
    let known: Vec<String> = rows.iter().map(|r| r.id.clone()).collect();
    for row in &rows {
        if !is_referenced(db, &row.id).await? {
            remove_if_unreferenced(db, root, std::slice::from_ref(&row.id)).await?;
            removed += 1;
        }
    }

    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if entry.path().is_dir() && !known.contains(&name) {
                remove_folder(&entry.path())?;
                removed += 1;
            }
        }
    }
    Ok(removed)
}

fn remove_folder(dir: &Path) -> Result<(), String> {
    match fs::remove_dir_all(dir) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("cannot remove {}: {e}", dir.display())),
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::commands::database::init_database;

    /// A fresh folder with its own database, removed when the test ends.
    pub(crate) struct TempStore {
        pub dir: PathBuf,
    }

    impl TempStore {
        pub(crate) fn new(name: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let dir = std::env::temp_dir().join(format!(
                "localgenie-bench-{name}-{}-{nanos}",
                std::process::id()
            ));
            fs::create_dir_all(&dir).expect("create temp dir");
            Self { dir }
        }

        pub(crate) async fn db(&self) -> DatabaseConnection {
            let url = format!("sqlite:{}?mode=rwc", self.dir.join("test.db").display());
            init_database(&url).await.expect("migrations apply")
        }

        pub(crate) fn root(&self) -> PathBuf {
            self.dir.join("store")
        }

        pub(crate) fn write(&self, name: &str, body: &str) -> String {
            let path = self.dir.join(name);
            fs::write(&path, body).expect("write source file");
            path.to_string_lossy().into_owned()
        }
    }

    impl Drop for TempStore {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    #[tokio::test]
    async fn import_copies_the_file_and_records_its_details() {
        let store = TempStore::new("import");
        let db = store.db().await;
        let src = store.write("notes.txt", "héllo");

        let file = import_file(&db, &store.root(), &src, "f1")
            .await
            .expect("import text file");

        assert_eq!(file.kind, "text");
        assert_eq!(file.name, "notes.txt");
        assert_eq!(file.chars, Some(5));
        assert_eq!(file.size, Some(6));
        assert_eq!(file.sha256.len(), 64);
        assert!(store.root().join("f1").join("notes.txt").is_file());
        assert!(Path::new(&file.stored_path).is_file());
    }

    #[tokio::test]
    async fn import_rejects_unsupported_types_and_duplicate_ids() {
        let store = TempStore::new("reject");
        let db = store.db().await;
        let exe = store.write("tool.exe", "x");
        assert!(import_file(&db, &store.root(), &exe, "f1").await.is_err());
        assert!(!store.root().join("f1").exists(), "nothing copied for a rejected file");

        let txt = store.write("a.txt", "a");
        import_file(&db, &store.root(), &txt, "f2")
            .await
            .expect("first import");
        assert!(import_file(&db, &store.root(), &txt, "f2").await.is_err());
    }

    #[tokio::test]
    async fn sweep_removes_unused_rows_and_stray_folders() {
        let store = TempStore::new("sweep");
        let db = store.db().await;
        let src = store.write("loose.txt", "x");
        import_file(&db, &store.root(), &src, "loose")
            .await
            .expect("import");
        fs::create_dir_all(store.root().join("stray")).expect("stray folder");

        let removed = sweep_orphans(&db, &store.root()).await.expect("sweep");

        assert_eq!(removed, 2);
        assert!(!store.root().join("loose").exists());
        assert!(!store.root().join("stray").exists());
        assert!(benchmark_file::Entity::find_by_id("loose")
            .one(&db)
            .await
            .expect("query")
            .is_none());
    }
}
