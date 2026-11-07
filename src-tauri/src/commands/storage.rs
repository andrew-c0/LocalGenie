//! Settings > Storage: the folders and files the app keeps, their sizes on disk, and whether the NSIS
//! uninstaller removes each one. `plan` is a pure function over `Locations`, so the headless cleanup
//! (`uninstall_cleanup.rs`) and the Storage card read one list of paths. This module also renames the
//! database from its legacy file name at startup (`startup_database_path`).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::benchmark_files::STORE_DIR as BENCHMARK_STORE_DIR;
use super::capabilities::models_root as geniex_models_root;
use super::cli::resolve_geniex_executable;
use super::playground::paths as playground_paths;
use super::runtimes::RUNTIMES_DIR;

/// The SQLite file in the app data folder, as `lib.rs` opens it.
pub const DATABASE_FILE: &str = "localGenie.db";
/// The name the database had before it was renamed. An install that still has it is renamed at
/// startup.
pub const LEGACY_DATABASE_FILE: &str = "geniex.db";
/// SQLite side files that belong to a database file.
const DATABASE_SIDE_SUFFIXES: [&str; 2] = ["-wal", "-shm"];
/// `FILE_ATTRIBUTE_REPARSE_POINT`: set on symlinks and junctions.
#[cfg(windows)]
const REPARSE_POINT_ATTRIBUTE: u32 = 0x400;

/// Where the app keeps its files. The caller resolves these and passes them in as values, so the
/// planning never reads the environment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Locations {
    /// The app data folder (`<APPDATA>\com.localgenie.app`).
    pub data_dir: PathBuf,
    /// The user's home folder. Never deleted, and never used as a deletion root.
    pub home: Option<PathBuf>,
    /// The GenieX model cache (`<GENIEX_DATADIR>\models`, else `~\.cache\geniex\models`).
    pub geniex_models: Option<PathBuf>,
    /// The folder of the resolved `geniex` executable.
    pub geniex_cli_dir: Option<PathBuf>,
}

/// When the NSIS uninstaller removes an item. Serialised as `always` or `optional`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Uninstall {
    Always,
    Optional,
}

/// One line of the Storage card, before it is measured.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlannedItem {
    pub id: &'static str,
    /// The folder, or the main file, of the item. Empty when the folder is unknown.
    pub path: PathBuf,
    /// Further files that belong to the item (the database's `-wal` and `-shm` files, and the
    /// legacy database family until it is renamed).
    pub side_files: Vec<PathBuf>,
    pub uninstall: Uninstall,
}

impl PlannedItem {
    fn new(id: &'static str, path: PathBuf, uninstall: Uninstall) -> Self {
        Self {
            id,
            path,
            side_files: Vec::new(),
            uninstall,
        }
    }
}

/// One entry of the Storage card, as the frontend reads it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageItem {
    pub id: &'static str,
    pub path: String,
    pub bytes: u64,
    pub exists: bool,
    pub uninstall: Uninstall,
}

/// The `storage_usage` reply.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StorageUsage {
    pub items: Vec<StorageItem>,
}

/// The items the Storage card lists, in display order. `geniex-cli` and `geniex-models` keep their
/// place with an empty path when the app cannot resolve them.
pub fn plan(loc: &Locations) -> Vec<PlannedItem> {
    let data = loc.data_dir.as_path();
    let database = data.join(DATABASE_FILE);
    // The current file's side files, then the whole legacy family, so a database that was never
    // renamed is still counted and removed.
    let side_files = database_family(data, DATABASE_FILE)
        .skip(1)
        .chain(database_family(data, LEGACY_DATABASE_FILE))
        .collect();
    vec![
        PlannedItem {
            side_files,
            ..PlannedItem::new("database", database, Uninstall::Optional)
        },
        PlannedItem::new(
            "playground-models",
            playground_paths::models_root(data),
            Uninstall::Optional,
        ),
        PlannedItem::new("runtimes", data.join(RUNTIMES_DIR), Uninstall::Always),
        PlannedItem::new(
            "benchmark-files",
            data.join(BENCHMARK_STORE_DIR),
            Uninstall::Optional,
        ),
        PlannedItem::new(
            "geniex-models",
            loc.geniex_models.clone().unwrap_or_default(),
            Uninstall::Optional,
        ),
        PlannedItem::new(
            "geniex-cli",
            loc.geniex_cli_dir.clone().unwrap_or_default(),
            Uninstall::Always,
        ),
    ]
}

/// A database file `name` in `data`, then its `-wal` and `-shm` side files.
fn database_family(data: &Path, name: &str) -> impl Iterator<Item = PathBuf> {
    let main = data.join(name);
    let sides: Vec<PathBuf> = DATABASE_SIDE_SUFFIXES
        .iter()
        .map(|suffix| with_suffix(&main, suffix))
        .collect();
    std::iter::once(main).chain(sides)
}

/// `path` with `suffix` appended to its file name, e.g. `geniex.db` and `-wal`.
fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

/// Rename the database from `LEGACY_DATABASE_FILE` to `DATABASE_FILE` in `data_dir`. Nothing is
/// deleted.
///
/// - Only the legacy file exists: its `-wal` and `-shm` files are renamed first and the main file
///   last. When a rename fails, the renames already done are put back, and the error is returned.
/// - Both exist: both are left alone and the current file is used; a warning is logged.
/// - Otherwise (no legacy file, or only the current one): nothing happens.
pub fn migrate_legacy_database(data_dir: &Path) -> Result<(), String> {
    let legacy = data_dir.join(LEGACY_DATABASE_FILE);
    let current = data_dir.join(DATABASE_FILE);
    if !legacy.exists() {
        return Ok(());
    }
    if current.exists() {
        eprintln!(
            "[storage] both {LEGACY_DATABASE_FILE} and {DATABASE_FILE} exist in {}; using {DATABASE_FILE} and leaving {LEGACY_DATABASE_FILE} alone",
            data_dir.display()
        );
        return Ok(());
    }
    let mut renames: Vec<(PathBuf, PathBuf)> = DATABASE_SIDE_SUFFIXES
        .iter()
        .map(|suffix| (with_suffix(&legacy, suffix), with_suffix(&current, suffix)))
        .filter(|(from, _)| from.exists())
        .collect();
    renames.push((legacy, current));

    let mut done: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (from, to) in renames {
        if let Err(e) = fs::rename(&from, &to) {
            let message = format!(
                "could not rename {} to {}: {e}",
                from.display(),
                to.display()
            );
            return Err(put_back(&done, message));
        }
        done.push((from, to));
    }
    Ok(())
}

/// Rename the renames in `done` back, newest first. Each failure is added to `message`.
fn put_back(done: &[(PathBuf, PathBuf)], mut message: String) -> String {
    for (from, to) in done.iter().rev() {
        if let Err(e) = fs::rename(to, from) {
            message = format!("{message}; could not put back {}: {e}", to.display());
        }
    }
    message
}

/// The database file `lib.rs` opens. The legacy file is renamed first. When that fails, the legacy
/// name is opened for this run, so the data is still read and nothing is lost.
pub fn startup_database_path(data_dir: &Path) -> PathBuf {
    match migrate_legacy_database(data_dir) {
        Ok(()) => data_dir.join(DATABASE_FILE),
        Err(e) => {
            eprintln!(
                "[storage] database not renamed, opening {LEGACY_DATABASE_FILE} for this run: {e}"
            );
            data_dir.join(LEGACY_DATABASE_FILE)
        }
    }
}

/// True for symlinks and, on Windows, junctions and other reparse points. Their targets are never
/// followed.
pub(crate) fn is_link(meta: &fs::Metadata) -> bool {
    #[cfg(windows)]
    let reparse = {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & REPARSE_POINT_ATTRIBUTE != 0
    };
    #[cfg(not(windows))]
    let reparse = false;
    meta.file_type().is_symlink() || reparse
}

/// Bytes under `path`. Links are not followed, and an entry that cannot be read counts as 0.
pub(crate) fn measure(path: &Path) -> u64 {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return 0;
    };
    if is_link(&meta) {
        0
    } else if meta.is_file() {
        meta.len()
    } else if meta.is_dir() {
        fs::read_dir(path).map_or(0, |entries| {
            entries.flatten().map(|entry| measure(&entry.path())).sum()
        })
    } else {
        0
    }
}

/// True when something is on disk at `path`. An empty path is never there.
fn is_present(path: &Path) -> bool {
    !path.as_os_str().is_empty() && fs::symlink_metadata(path).is_ok()
}

/// The card's view of one planned item: it exists when its path or one of its side files is there.
fn storage_item(item: &PlannedItem) -> StorageItem {
    let exists = is_present(&item.path) || item.side_files.iter().any(|file| is_present(file));
    let bytes = measure(&item.path)
        + item
            .side_files
            .iter()
            .map(|file| measure(file))
            .sum::<u64>();
    StorageItem {
        id: item.id,
        path: item.path.to_string_lossy().into_owned(),
        bytes,
        exists,
        uninstall: item.uninstall,
    }
}

/// Measure every planned item. This does file IO, so call it off the async runtime.
pub fn measure_usage(loc: &Locations) -> StorageUsage {
    StorageUsage {
        items: plan(loc).iter().map(storage_item).collect(),
    }
}

/// Resolve the folders from the app data folder and the environment.
pub fn locations(data_dir: PathBuf) -> Locations {
    let cli_binary = resolve_geniex_executable();
    Locations {
        data_dir,
        home: home_dir(),
        geniex_models: geniex_models_root(),
        geniex_cli_dir: cli_binary
            .parent()
            .filter(|dir| !dir.as_os_str().is_empty())
            .map(Path::to_path_buf),
    }
}

/// The home folder: `USERPROFILE`, else `HOME`.
pub(crate) fn home_dir() -> Option<PathBuf> {
    ["USERPROFILE", "HOME"]
        .iter()
        .find_map(|var| std::env::var_os(var).filter(|value| !value.is_empty()))
        .map(PathBuf::from)
}

/// The folders of the running app, resolved from the app handle.
fn app_locations(app: &AppHandle) -> Result<Locations, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data folder unavailable: {e}"))?;
    Ok(locations(data_dir))
}

/// Sizes of the app's folders and files, for the Settings Storage card.
#[tauri::command]
pub async fn storage_usage(app: AppHandle) -> Result<StorageUsage, String> {
    let loc = app_locations(&app)?;
    tauri::async_runtime::spawn_blocking(move || measure_usage(&loc))
        .await
        .map_err(|e| format!("Storage check did not finish: {e}"))
}

/// The folder to open for one card item. The id must be one the card lists; an unresolved folder
/// or one that is not on disk is refused. A file item (the database) opens its folder. Nothing is
/// created.
pub fn open_target(loc: &Locations, id: &str) -> Result<PathBuf, String> {
    let item = plan(loc)
        .into_iter()
        .find(|item| item.id == id)
        .ok_or_else(|| format!("Unknown storage item: {id}"))?;
    if item.path.as_os_str().is_empty() {
        return Err(format!(
            "The folder for {id} is not known on this computer."
        ));
    }
    let folder = folder_of(item.path);
    if !folder.is_dir() {
        return Err(format!(
            "The folder for {id} does not exist: {}",
            folder.display()
        ));
    }
    Ok(folder)
}

/// A file maps to the folder that holds it; a folder maps to itself.
fn folder_of(path: PathBuf) -> PathBuf {
    if fs::metadata(&path).is_ok_and(|meta| meta.is_file()) {
        if let Some(parent) = path.parent() {
            return parent.to_path_buf();
        }
    }
    path
}

/// Open one Storage card item's folder in Explorer. The frontend sends the item id only.
#[tauri::command]
pub async fn storage_open_folder(app: AppHandle, id: String) -> Result<(), String> {
    let loc = app_locations(&app)?;
    let folder = open_target(&loc, &id)?;
    open_in_explorer(&folder)
}

/// Open `folder` in Explorer. Explorer is a GUI program, so no console window opens. The start is
/// checked, not the exit code.
#[cfg(target_os = "windows")]
fn open_in_explorer(folder: &Path) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(folder)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("could not start Explorer: {e}"))
}

#[cfg(not(target_os = "windows"))]
fn open_in_explorer(_folder: &Path) -> Result<(), String> {
    Err("Opening folders is only supported on Windows.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::runtimes::test_support::Scratch;

    fn locations_under(root: &Path) -> Locations {
        Locations {
            data_dir: root.join("data"),
            home: Some(root.join("home")),
            geniex_models: Some(root.join("cache").join("models")),
            geniex_cli_dir: Some(root.join("cli")),
        }
    }

    fn ids(items: &[PlannedItem]) -> Vec<&'static str> {
        items.iter().map(|item| item.id).collect()
    }

    fn find<'a>(items: &'a [PlannedItem], id: &str) -> &'a PlannedItem {
        items
            .iter()
            .find(|item| item.id == id)
            .expect("item is planned")
    }

    fn write_file(path: &Path, bytes: usize) {
        fs::create_dir_all(path.parent().expect("parent")).expect("create folder");
        fs::write(path, vec![7u8; bytes]).expect("write file");
    }

    fn write_text(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("create folder");
        fs::write(path, text).expect("write file");
    }

    fn read_text(path: &Path) -> String {
        fs::read_to_string(path).expect("file is there")
    }

    #[test]
    fn plans_every_item_in_card_order() {
        let root = Scratch::new("storage-order");
        let items = plan(&locations_under(root.path()));
        assert_eq!(
            ids(&items),
            [
                "database",
                "playground-models",
                "runtimes",
                "benchmark-files",
                "geniex-models",
                "geniex-cli",
            ]
        );
    }

    #[test]
    fn uninstall_policy_matches_the_nsis_contract() {
        let root = Scratch::new("storage-policy");
        let items = plan(&locations_under(root.path()));
        let policy: Vec<(&str, Uninstall)> =
            items.iter().map(|item| (item.id, item.uninstall)).collect();
        assert_eq!(
            policy,
            vec![
                ("database", Uninstall::Optional),
                ("playground-models", Uninstall::Optional),
                ("runtimes", Uninstall::Always),
                ("benchmark-files", Uninstall::Optional),
                ("geniex-models", Uninstall::Optional),
                ("geniex-cli", Uninstall::Always),
            ]
        );
    }

    #[test]
    fn database_items_include_the_wal_and_shm_side_files_of_both_names() {
        let root = Scratch::new("storage-db");
        let items = plan(&locations_under(root.path()));
        let database = find(&items, "database");
        let data = root.path().join("data");
        assert_eq!(database.path, data.join("localGenie.db"));
        assert_eq!(
            database.side_files,
            vec![
                data.join("localGenie.db-wal"),
                data.join("localGenie.db-shm"),
                data.join("geniex.db"),
                data.join("geniex.db-wal"),
                data.join("geniex.db-shm"),
            ]
        );
    }

    #[test]
    fn missing_folders_do_not_exist_and_weigh_nothing() {
        let root = Scratch::new("storage-missing");
        let usage = measure_usage(&locations_under(root.path()));
        let runtimes = usage
            .items
            .iter()
            .find(|item| item.id == "runtimes")
            .expect("runtimes listed");
        assert!(!runtimes.exists);
        assert_eq!(runtimes.bytes, 0);
    }

    #[test]
    fn sizes_add_up_across_nested_files() {
        let root = Scratch::new("storage-sizes");
        let loc = locations_under(root.path());
        write_file(&loc.data_dir.join("runtimes").join("a.bin"), 100);
        write_file(&loc.data_dir.join("runtimes").join("sub").join("b.bin"), 25);
        write_file(&loc.data_dir.join("localGenie.db"), 10);
        write_file(&loc.data_dir.join("localGenie.db-wal"), 5);
        write_file(&loc.data_dir.join("geniex.db"), 3);
        let usage = measure_usage(&loc);
        let by_id = |id: &str| {
            usage
                .items
                .iter()
                .find(|item| item.id == id)
                .expect("listed")
                .clone()
        };
        assert_eq!(by_id("runtimes").bytes, 125);
        assert!(by_id("runtimes").exists);
        assert_eq!(by_id("database").bytes, 18);
    }

    #[test]
    fn a_database_that_was_not_renamed_is_still_shown_and_measured() {
        let root = Scratch::new("storage-legacy-only");
        let loc = locations_under(root.path());
        write_file(&loc.data_dir.join("geniex.db"), 12);
        let usage = measure_usage(&loc);
        let database = usage
            .items
            .iter()
            .find(|item| item.id == "database")
            .expect("listed");
        assert!(database.exists);
        assert_eq!(database.bytes, 12);
    }

    #[test]
    fn unresolved_cli_folder_is_listed_with_an_empty_path() {
        let root = Scratch::new("storage-no-cli");
        let mut loc = locations_under(root.path());
        loc.geniex_cli_dir = None;
        let usage = measure_usage(&loc);
        let cli = usage
            .items
            .iter()
            .find(|item| item.id == "geniex-cli")
            .expect("listed");
        assert_eq!(cli.path, "");
        assert!(!cli.exists);
        assert_eq!(cli.bytes, 0);
    }

    #[test]
    fn open_target_refuses_ids_the_card_does_not_list() {
        let root = Scratch::new("storage-open-unknown");
        let loc = locations_under(root.path());
        assert!(open_target(&loc, "../etc").is_err());
        assert!(open_target(&loc, "").is_err());
        assert!(open_target(&loc, "Runtimes").is_err());
        for removed in ["downloads", "pictures", "playground-images-legacy"] {
            assert!(open_target(&loc, removed).is_err(), "{removed} is removed");
        }
    }

    #[test]
    fn open_target_returns_an_existing_folder() {
        let root = Scratch::new("storage-open-folder");
        let loc = locations_under(root.path());
        let runtimes = loc.data_dir.join(RUNTIMES_DIR);
        fs::create_dir_all(&runtimes).expect("create runtimes");
        assert_eq!(open_target(&loc, "runtimes"), Ok(runtimes));
    }

    #[test]
    fn open_target_opens_the_folder_of_a_file_item() {
        let root = Scratch::new("storage-open-file");
        let loc = locations_under(root.path());
        write_file(&loc.data_dir.join(DATABASE_FILE), 1);
        assert_eq!(open_target(&loc, "database"), Ok(loc.data_dir.clone()));
    }

    #[test]
    fn open_target_refuses_a_missing_folder_and_creates_nothing() {
        let root = Scratch::new("storage-open-missing");
        let loc = locations_under(root.path());
        let result = open_target(&loc, "runtimes");
        assert!(result.is_err());
        assert!(!loc.data_dir.join(RUNTIMES_DIR).exists());
    }

    #[test]
    fn open_target_refuses_an_unresolved_cli_folder() {
        let root = Scratch::new("storage-open-cli");
        let mut loc = locations_under(root.path());
        loc.geniex_cli_dir = None;
        assert!(open_target(&loc, "geniex-cli").is_err());
    }

    #[test]
    fn home_is_taken_from_the_environment_when_set() {
        // Reads the process environment only; the result is whatever the machine has.
        if let Some(home) = home_dir() {
            assert!(!home.as_os_str().is_empty());
        }
    }

    #[test]
    fn only_the_legacy_database_is_renamed_with_its_side_files() {
        let root = Scratch::new("migrate-only-legacy");
        let data = root.path();
        write_text(&data.join("geniex.db"), "main");
        write_text(&data.join("geniex.db-wal"), "wal");
        write_text(&data.join("geniex.db-shm"), "shm");
        assert_eq!(migrate_legacy_database(data), Ok(()));
        assert_eq!(read_text(&data.join("localGenie.db")), "main");
        assert_eq!(read_text(&data.join("localGenie.db-wal")), "wal");
        assert_eq!(read_text(&data.join("localGenie.db-shm")), "shm");
        assert!(!data.join("geniex.db").exists());
        assert!(!data.join("geniex.db-wal").exists());
        assert!(!data.join("geniex.db-shm").exists());
    }

    #[test]
    fn a_legacy_database_without_side_files_is_renamed() {
        let root = Scratch::new("migrate-main-only");
        let data = root.path();
        write_text(&data.join("geniex.db"), "main");
        assert_eq!(migrate_legacy_database(data), Ok(()));
        assert_eq!(read_text(&data.join("localGenie.db")), "main");
        assert!(!data.join("geniex.db").exists());
    }

    #[test]
    fn only_the_new_database_is_left_alone() {
        let root = Scratch::new("migrate-only-new");
        let data = root.path();
        write_text(&data.join("localGenie.db"), "new");
        write_text(&data.join("localGenie.db-wal"), "new-wal");
        assert_eq!(migrate_legacy_database(data), Ok(()));
        assert_eq!(read_text(&data.join("localGenie.db")), "new");
        assert_eq!(read_text(&data.join("localGenie.db-wal")), "new-wal");
    }

    #[test]
    fn when_both_exist_both_are_left_alone_and_the_new_one_is_used() {
        let root = Scratch::new("migrate-both");
        let data = root.path();
        write_text(&data.join("localGenie.db"), "new");
        write_text(&data.join("geniex.db"), "old");
        write_text(&data.join("geniex.db-wal"), "old-wal");
        assert_eq!(migrate_legacy_database(data), Ok(()));
        assert_eq!(read_text(&data.join("localGenie.db")), "new");
        assert_eq!(read_text(&data.join("geniex.db")), "old");
        assert_eq!(read_text(&data.join("geniex.db-wal")), "old-wal");
        assert!(!data.join("localGenie.db-wal").exists());
        assert_eq!(startup_database_path(data), data.join("localGenie.db"));
    }

    #[test]
    fn nothing_to_migrate_is_not_an_error() {
        let root = Scratch::new("migrate-none");
        assert_eq!(migrate_legacy_database(root.path()), Ok(()));
        assert_eq!(
            startup_database_path(root.path()),
            root.path().join("localGenie.db")
        );
    }

    #[test]
    fn a_failed_side_file_rename_puts_the_earlier_renames_back() {
        let root = Scratch::new("migrate-rollback");
        let data = root.path();
        write_text(&data.join("geniex.db"), "main");
        write_text(&data.join("geniex.db-wal"), "wal");
        write_text(&data.join("geniex.db-shm"), "shm");
        // A folder where the -shm file should go makes that rename fail after the -wal rename.
        fs::create_dir_all(data.join("localGenie.db-shm")).expect("blocker folder");

        let result = migrate_legacy_database(data);
        assert!(result.is_err(), "the rename fails");
        assert_eq!(read_text(&data.join("geniex.db")), "main");
        assert_eq!(read_text(&data.join("geniex.db-wal")), "wal");
        assert_eq!(read_text(&data.join("geniex.db-shm")), "shm");
        assert!(!data.join("localGenie.db").exists());
        assert!(!data.join("localGenie.db-wal").exists());
        assert_eq!(startup_database_path(data), data.join("geniex.db"));
    }
}
