//! Headless cleanup for the NSIS uninstaller: `LocalGenie.exe --uninstall-cleanup [--delete-data]`.
//! It runs before the window exists. It removes the GenieX CLI, the GenieX setup programs left in
//! the app data folder, and the app's `runtimes` folder and, with `--delete-data`, the user data.
//! The app data folder itself is left to the uninstaller.
//! Each step is appended to `%TEMP%\LocalGenie-uninstall.log`.
//!
//! Exit code: 0 when every planned step succeeded (or was skipped), 1 when any step failed.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use super::cli::resolve_geniex_executable;
use super::playground::paths::legacy_images_root;
use super::runtimes::geniex::{sweep_setup_files, uninstall_cli, SetupLeftovers};
use super::storage::{self, is_link, plan, Locations, PlannedItem, Uninstall};

/// Process argument that selects the headless cleanup.
pub const CLEANUP_FLAG: &str = "--uninstall-cleanup";
/// Optional companion flag: also remove the user data.
pub const DELETE_DATA_FLAG: &str = "--delete-data";
/// Log file name, created in the temp folder.
const LOG_FILE_NAME: &str = "LocalGenie-uninstall.log";
/// The Tauri identifier of the app (`tauri.conf.json`). The app data folder is `<APPDATA>\<id>`.
const APP_IDENTIFIER: &str = "com.localgenie.app";
/// Storage card ids the cleanup works on.
const RUNTIMES_ID: &str = "runtimes";
const GENIEX_MODELS_ID: &str = "geniex-models";
/// The Playground image folder from before it moved. It has no Storage card item; only the cleanup
/// removes it, with `--delete-data`.
const LEGACY_IMAGES_ID: &str = "playground-images-legacy";
/// Log step of the GenieX setup programs left in the app data folder.
const SETUP_STEP_ID: &str = "geniex-setup";

/// Options of the headless cleanup.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CleanupArgs {
    pub delete_data: bool,
}

/// The cleanup options from the process arguments (without the program name). `None` means the
/// app starts normally. `--delete-data` alone does nothing: it only modifies the cleanup.
pub fn parse_args<I, S>(args: I) -> Option<CleanupArgs>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut cleanup = false;
    let mut delete_data = false;
    for arg in args {
        match arg.as_ref() {
            CLEANUP_FLAG => cleanup = true,
            DELETE_DATA_FLAG => delete_data = true,
            _ => {}
        }
    }
    cleanup.then_some(CleanupArgs { delete_data })
}

/// How a cleanup target is removed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Removal {
    /// The path itself: a folder tree or a file.
    Whole,
    /// The entries inside the folder, then the folder itself. The folder's parent is never touched.
    ContentsThenFolder,
}

/// One path the cleanup may remove. `path` must lie strictly inside `root`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupTarget {
    pub id: &'static str,
    pub path: PathBuf,
    pub root: PathBuf,
    pub removal: Removal,
}

/// The paths the cleanup removes, in order. Pure: nothing is touched here.
/// Without `delete_data` only the `runtimes` folder is planned. With it, every optional item of the
/// Storage card is planned too, plus the legacy Playground image folder. The GenieX CLI is not a
/// target: it is removed by its uninstaller.
pub fn plan_cleanup(loc: &Locations, delete_data: bool) -> Vec<CleanupTarget> {
    let mut targets: Vec<CleanupTarget> = plan(loc)
        .into_iter()
        .filter(|item| !item.path.as_os_str().is_empty())
        .filter(|item| match item.uninstall {
            Uninstall::Always => item.id == RUNTIMES_ID,
            Uninstall::Optional => delete_data,
        })
        .flat_map(|item| targets_for(&item, &loc.data_dir))
        .collect();
    if delete_data {
        targets.push(CleanupTarget {
            id: LEGACY_IMAGES_ID,
            path: legacy_images_root(&loc.data_dir),
            root: loc.data_dir.clone(),
            removal: Removal::Whole,
        });
    }
    targets
}

/// The cleanup targets of one planned item. The database also removes its side files, under both
/// its current and its legacy name.
fn targets_for(item: &PlannedItem, data_dir: &Path) -> Vec<CleanupTarget> {
    if item.id == GENIEX_MODELS_ID {
        // The model cache folder is emptied, then removed. Its parent is only the boundary.
        let root = item
            .path
            .parent()
            .map_or_else(|| item.path.clone(), Path::to_path_buf);
        return vec![CleanupTarget {
            id: item.id,
            path: item.path.clone(),
            root,
            removal: Removal::ContentsThenFolder,
        }];
    }
    std::iter::once(&item.path)
        .chain(&item.side_files)
        .map(|path| CleanupTarget {
            id: item.id,
            path: path.clone(),
            root: data_dir.to_path_buf(),
            removal: Removal::Whole,
        })
        .collect()
}

/// True when `path` is strictly below `root`: not equal to it, and made only of normal parts (no
/// `.` or `..`). This is a lexical check; `checked_path` also compares the canonical paths.
pub(crate) fn strictly_inside(path: &Path, root: &Path) -> bool {
    path != root
        && path.starts_with(root)
        && path.components().all(|part| {
            matches!(
                part,
                Component::Prefix(_) | Component::RootDir | Component::Normal(_)
            )
        })
}

/// True for a folder that must never be a deletion root or target: a relative or empty path, a
/// drive or filesystem root, or the home folder.
fn is_unsafe_folder(path: &Path, home: Option<&Path>) -> bool {
    path.as_os_str().is_empty()
        || !path.is_absolute()
        || path.parent().is_none()
        || home.is_some_and(|home| same_folder(path, home))
}

/// Same folder after resolving links; a plain comparison when either path cannot be resolved.
fn same_folder(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// Check a target before anything is removed. `Ok(None)` means the path is not there, which is not
/// an error. Refuses unsafe folders, paths outside their root, links, and paths that resolve
/// outside their root.
fn checked_path(target: &CleanupTarget, home: Option<&Path>) -> Result<Option<PathBuf>, String> {
    let shown = target.path.display();
    if is_unsafe_folder(&target.root, home) || is_unsafe_folder(&target.path, home) {
        return Err(format!("refused: {shown} is not a safe folder to remove"));
    }
    if !strictly_inside(&target.path, &target.root) {
        return Err(format!(
            "refused: {shown} is not inside {}",
            target.root.display()
        ));
    }
    let meta = match fs::symlink_metadata(&target.path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("could not read {shown}: {e}")),
    };
    if is_link(&meta) {
        return Err(format!("refused: {shown} is a link"));
    }
    let root = fs::canonicalize(&target.root)
        .map_err(|e| format!("could not resolve {}: {e}", target.root.display()))?;
    let real =
        fs::canonicalize(&target.path).map_err(|e| format!("could not resolve {shown}: {e}"))?;
    if !strictly_inside(&real, &root) {
        return Err(format!("refused: {shown} resolves outside its folder"));
    }
    Ok(Some(target.path.clone()))
}

/// Remove one target. Returns the log detail on success.
fn remove_target(target: &CleanupTarget, home: Option<&Path>) -> Result<String, String> {
    let Some(path) = checked_path(target, home)? else {
        return Ok(format!("not present: {}", target.path.display()));
    };
    match target.removal {
        Removal::Whole => {
            remove_whole(&path).map_err(|e| format!("could not remove {}: {e}", path.display()))?;
            Ok(format!("removed {}", path.display()))
        }
        Removal::ContentsThenFolder => remove_contents_then_folder(target, &path, home),
    }
}

/// A file, or a folder tree. Links were refused by `checked_path`.
fn remove_whole(path: &Path) -> io::Result<()> {
    if fs::symlink_metadata(path)?.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

/// Remove each entry of `folder` as its own checked target, then the folder if it is empty. When
/// any entry fails, the folder is kept.
fn remove_contents_then_folder(
    target: &CleanupTarget,
    folder: &Path,
    home: Option<&Path>,
) -> Result<String, String> {
    let entries =
        fs::read_dir(folder).map_err(|e| format!("could not list {}: {e}", folder.display()))?;
    let mut removed = 0usize;
    let mut failures = Vec::new();
    for entry in entries {
        let child = match entry {
            Ok(entry) => CleanupTarget {
                id: target.id,
                path: entry.path(),
                root: folder.to_path_buf(),
                removal: Removal::Whole,
            },
            Err(e) => {
                failures.push(e.to_string());
                continue;
            }
        };
        match remove_target(&child, home) {
            Ok(_) => removed += 1,
            Err(e) => failures.push(e),
        }
    }
    if !failures.is_empty() {
        return Err(format!(
            "{} entries could not be removed, so {} was kept: {}",
            failures.len(),
            folder.display(),
            failures.join("; ")
        ));
    }
    fs::remove_dir(folder).map_err(|e| format!("could not remove {}: {e}", folder.display()))?;
    Ok(format!(
        "removed {removed} entries and {}",
        folder.display()
    ))
}

/// The log file, appended to. A log that cannot be opened is skipped: the exit code still reports
/// the result.
struct CleanupLog {
    file: Option<fs::File>,
}

impl CleanupLog {
    fn open(path: &Path) -> Self {
        let file = OpenOptions::new().create(true).append(true).open(path).ok();
        Self { file }
    }

    /// One line: `[<unix seconds>] <STATUS> <step>: <detail>`.
    fn event(&mut self, status: &str, step: &str, detail: &str) {
        let line = format_line(unix_seconds(), status, step, detail);
        if let Some(file) = self.file.as_mut() {
            let _ = file.write_all(line.as_bytes());
        }
    }
}

/// One log line, with its newline.
fn format_line(unix_secs: u64, status: &str, step: &str, detail: &str) -> String {
    format!("[{unix_secs}] {status} {step}: {detail}\n")
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

/// Remove each target in order and log it. One failure does not stop the others. Returns the
/// number of failures.
fn remove_all(targets: &[CleanupTarget], home: Option<&Path>, log: &mut CleanupLog) -> u32 {
    let mut failures = 0;
    for target in targets {
        match remove_target(target, home) {
            Ok(detail) => log.event("OK", target.id, &detail),
            Err(e) => {
                failures += 1;
                log.event("FAILED", target.id, &e);
            }
        }
    }
    failures
}

/// Remove the GenieX setup programs and partial downloads from the app data folder, with or without
/// `--delete-data`: the folder stays after an uninstall that keeps the data. Logs each file. Returns
/// the number of failed removals.
fn sweep_setup_leftovers(data_dir: &Path, log: &mut CleanupLog) -> u32 {
    let report = sweep_setup_files(data_dir, None, SetupLeftovers::WithPartials);
    for path in &report.removed {
        log.event("OK", SETUP_STEP_ID, &format!("removed {}", path.display()));
    }
    for (path, error) in &report.failed {
        log.event(
            "FAILED",
            SETUP_STEP_ID,
            &format!("could not remove {}: {error}", path.display()),
        );
    }
    u32::try_from(report.failed.len()).unwrap_or(u32::MAX)
}

/// `<APPDATA>\com.localgenie.app`, the folder Tauri uses on Windows, found without an app handle.
fn app_data_folder() -> Result<PathBuf, String> {
    let roaming = std::env::var_os("APPDATA")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "APPDATA is not set".to_string())?;
    Ok(PathBuf::from(roaming).join(APP_IDENTIFIER))
}

/// The GenieX CLI is present when the resolved binary is an absolute path to an existing file.
/// A bare name means nothing was found.
fn cli_installed() -> bool {
    let binary = resolve_geniex_executable();
    binary.is_absolute() && binary.is_file()
}

/// Run the cleanup and return the process exit code.
pub fn run(args: CleanupArgs) -> i32 {
    let mut log = CleanupLog::open(&std::env::temp_dir().join(LOG_FILE_NAME));
    let mode = if args.delete_data {
        "with --delete-data"
    } else {
        "without --delete-data"
    };
    log.event("START", "cleanup", mode);
    let failures = execute(args, &mut log);
    let status = if failures == 0 { "OK" } else { "FAILED" };
    log.event(
        status,
        "cleanup",
        &format!("finished with {failures} failed step(s)"),
    );
    i32::from(failures > 0)
}

/// The steps: the GenieX CLI, then the planned folders. Returns the number of failed steps.
fn execute(args: CleanupArgs, log: &mut CleanupLog) -> u32 {
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(e) => {
            log.event("FAILED", "runtime", &e.to_string());
            return 1;
        }
    };
    let mut failures = 0;
    if cli_installed() {
        match runtime.block_on(uninstall_cli()) {
            Ok(()) => log.event("OK", "geniex-cli", "uninstalled"),
            Err(e) => {
                failures += 1;
                log.event("FAILED", "geniex-cli", &e);
            }
        }
    } else {
        log.event("SKIPPED", "geniex-cli", "not installed");
    }

    let loc = match app_data_folder().map(storage::locations) {
        Ok(loc) => loc,
        Err(e) => {
            log.event("FAILED", "app-data", &e);
            return failures + 1;
        }
    };
    let setup_failures = sweep_setup_leftovers(&loc.data_dir, log);
    let targets = plan_cleanup(&loc, args.delete_data);
    failures + setup_failures + remove_all(&targets, loc.home.as_deref(), log)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::runtimes::test_support::Scratch;
    use crate::commands::runtimes::RUNTIMES_DIR;

    fn locations_under(root: &Path) -> Locations {
        Locations {
            data_dir: root.join("data"),
            home: Some(root.join("home")),
            geniex_models: Some(root.join("cache").join("models")),
            geniex_cli_dir: Some(root.join("cli")),
        }
    }

    fn ids(targets: &[CleanupTarget]) -> Vec<&'static str> {
        targets.iter().map(|target| target.id).collect()
    }

    fn null_log() -> CleanupLog {
        CleanupLog { file: None }
    }

    #[test]
    fn parses_the_cleanup_flag_with_and_without_delete_data() {
        assert_eq!(
            parse_args(["--uninstall-cleanup"]),
            Some(CleanupArgs { delete_data: false })
        );
        assert_eq!(
            parse_args(["--uninstall-cleanup", "--delete-data"]),
            Some(CleanupArgs { delete_data: true })
        );
        assert_eq!(
            parse_args(["--delete-data", "--uninstall-cleanup"]),
            Some(CleanupArgs { delete_data: true })
        );
    }

    #[test]
    fn normal_launch_arguments_do_not_start_the_cleanup() {
        let none: [&str; 0] = [];
        assert_eq!(parse_args(none), None);
        assert_eq!(parse_args(["--delete-data"]), None);
        assert_eq!(parse_args(["--some-other-flag"]), None);
    }

    #[test]
    fn without_delete_data_only_runtimes_is_planned() {
        let root = Scratch::new("cleanup-plan-keep");
        let targets = plan_cleanup(&locations_under(root.path()), false);
        assert_eq!(ids(&targets), ["runtimes"]);
        assert_eq!(targets[0].path, root.path().join("data").join(RUNTIMES_DIR));
        assert_eq!(targets[0].root, root.path().join("data"));
        assert_eq!(targets[0].removal, Removal::Whole);
    }

    #[test]
    fn with_delete_data_the_optional_items_are_planned_in_order() {
        let root = Scratch::new("cleanup-plan-data");
        let targets = plan_cleanup(&locations_under(root.path()), true);
        assert_eq!(
            ids(&targets),
            [
                "database",
                "database",
                "database",
                "database",
                "database",
                "database",
                "playground-models",
                "runtimes",
                "benchmark-files",
                "geniex-models",
                "playground-images-legacy",
            ]
        );
    }

    #[test]
    fn the_database_is_planned_under_both_names_with_their_side_files() {
        let root = Scratch::new("cleanup-plan-db");
        let targets = plan_cleanup(&locations_under(root.path()), true);
        let paths: Vec<PathBuf> = targets
            .iter()
            .filter(|target| target.id == "database")
            .map(|target| target.path.clone())
            .collect();
        let data = root.path().join("data");
        assert_eq!(
            paths,
            vec![
                data.join("localGenie.db"),
                data.join("localGenie.db-wal"),
                data.join("localGenie.db-shm"),
                data.join("geniex.db"),
                data.join("geniex.db-wal"),
                data.join("geniex.db-shm"),
            ]
        );
        assert!(targets
            .iter()
            .filter(|target| target.id == "database")
            .all(|target| target.root == data && target.removal == Removal::Whole));
    }

    #[test]
    fn the_legacy_images_folder_is_planned_only_with_delete_data() {
        let root = Scratch::new("cleanup-plan-legacy-images");
        let loc = locations_under(root.path());
        assert!(!ids(&plan_cleanup(&loc, false)).contains(&LEGACY_IMAGES_ID));
        let targets = plan_cleanup(&loc, true);
        let images = targets
            .iter()
            .find(|target| target.id == LEGACY_IMAGES_ID)
            .expect("planned");
        assert_eq!(images.path, legacy_images_root(&loc.data_dir));
        assert_eq!(images.root, loc.data_dir);
    }

    #[test]
    fn the_model_cache_is_emptied_with_its_parent_as_boundary_only() {
        let root = Scratch::new("cleanup-plan-models");
        let targets = plan_cleanup(&locations_under(root.path()), true);
        let models = targets
            .iter()
            .find(|target| target.id == "geniex-models")
            .expect("planned");
        assert_eq!(models.removal, Removal::ContentsThenFolder);
        assert_eq!(models.path, root.path().join("cache").join("models"));
        assert_eq!(models.root, root.path().join("cache"));
    }

    #[test]
    fn the_cli_and_the_user_folders_are_never_planned() {
        let root = Scratch::new("cleanup-plan-never");
        let loc = locations_under(root.path());
        let targets = plan_cleanup(&loc, true);
        assert!(targets.iter().all(|target| target.id != "geniex-cli"));
        assert!(targets
            .iter()
            .all(|target| !target.path.starts_with(root.path().join("home"))));
    }

    #[test]
    fn unknown_model_cache_is_not_planned_as_a_path() {
        let root = Scratch::new("cleanup-plan-no-cache");
        let mut loc = locations_under(root.path());
        loc.geniex_models = None;
        let targets = plan_cleanup(&loc, true);
        assert!(targets.iter().all(|target| target.id != "geniex-models"));
    }

    #[test]
    fn a_path_must_be_strictly_inside_its_root() {
        let root = Path::new("/data/app");
        assert!(strictly_inside(Path::new("/data/app/runtimes"), root));
        assert!(!strictly_inside(root, root), "the root itself is refused");
        assert!(
            !strictly_inside(Path::new("/data/app2/x"), root),
            "a name prefix is not a child"
        );
        assert!(!strictly_inside(Path::new("/data/other"), root));
        assert!(
            !strictly_inside(Path::new("/data/app/../x"), root),
            "parent parts are refused"
        );
    }

    #[test]
    fn empty_relative_root_and_home_folders_are_unsafe() {
        let root = Scratch::new("cleanup-unsafe");
        let home = root.path().join("home");
        fs::create_dir_all(&home).expect("home");
        assert!(is_unsafe_folder(Path::new(""), None));
        assert!(is_unsafe_folder(Path::new("relative/dir"), None));
        assert!(is_unsafe_folder(Path::new("geniex"), None));
        assert!(is_unsafe_folder(
            Path::new(std::path::MAIN_SEPARATOR_STR),
            None
        ));
        assert!(is_unsafe_folder(&home, Some(&home)));
        assert!(!is_unsafe_folder(
            &home.join(".cache").join("geniex"),
            Some(&home)
        ));
    }

    #[test]
    fn a_target_outside_its_root_is_refused_and_left_alone() {
        let root = Scratch::new("cleanup-outside");
        let outside = root.touch("outside/keep.db");
        let target = CleanupTarget {
            id: "database",
            path: outside.clone(),
            root: root.path().join("data"),
            removal: Removal::Whole,
        };
        assert!(remove_target(&target, None).is_err());
        assert!(outside.exists());
    }

    #[test]
    fn a_missing_target_is_not_an_error() {
        let root = Scratch::new("cleanup-missing");
        let target = CleanupTarget {
            id: "runtimes",
            path: root.path().join("data").join(RUNTIMES_DIR),
            root: root.path().join("data"),
            removal: Removal::Whole,
        };
        assert!(remove_target(&target, None).is_ok());
    }

    #[test]
    fn removes_the_runtimes_folder_and_keeps_its_siblings() {
        let root = Scratch::new("cleanup-runtimes");
        let runtimes_file = root.touch("data/runtimes/sd/1.0/bin.exe");
        let sibling = root.touch("data/localGenie.db");
        let loc = locations_under(root.path());
        let mut log = null_log();
        let failures = remove_all(&plan_cleanup(&loc, false), loc.home.as_deref(), &mut log);
        assert_eq!(failures, 0);
        assert!(!runtimes_file.exists());
        assert!(!root.path().join("data/runtimes").exists());
        assert!(
            sibling.exists(),
            "the database is kept without --delete-data"
        );
    }

    #[test]
    fn delete_data_removes_user_data_but_not_downloads_or_the_cache_parent() {
        let root = Scratch::new("cleanup-data");
        let loc = locations_under(root.path());
        let db = root.touch("data/localGenie.db");
        let wal = root.touch("data/localGenie.db-wal");
        let legacy_db = root.touch("data/geniex.db");
        let legacy_shm = root.touch("data/geniex.db-shm");
        let legacy_image = legacy_images_root(&loc.data_dir).join("old.png");
        fs::create_dir_all(legacy_image.parent().expect("parent")).expect("images folder");
        fs::write(&legacy_image, b"x").expect("write image");
        let model = root.touch("cache/models/org/model/weights.gguf");
        let cache_sibling = root.touch("cache/keep.txt");
        let download = root.touch("home/Downloads/big.gguf");
        let picture = root.touch("home/Pictures/image.png");
        let mut log = null_log();
        let failures = remove_all(&plan_cleanup(&loc, true), loc.home.as_deref(), &mut log);
        assert_eq!(failures, 0);
        assert!(!db.exists());
        assert!(!wal.exists());
        assert!(
            !legacy_db.exists(),
            "a database never renamed is removed too"
        );
        assert!(!legacy_shm.exists());
        assert!(!legacy_image.exists(), "the legacy image folder is removed");
        assert!(!model.exists());
        assert!(
            !root.path().join("cache/models").exists(),
            "the model folder is removed"
        );
        assert!(
            cache_sibling.exists(),
            "the parent of the model folder is kept"
        );
        assert!(download.exists());
        assert!(picture.exists());
    }

    #[test]
    fn one_failing_target_does_not_stop_the_others() {
        let root = Scratch::new("cleanup-continue");
        let kept = root.touch("outside/keep.txt");
        let runtimes = root.touch("data/runtimes/a.bin");
        let targets = vec![
            CleanupTarget {
                id: "database",
                path: kept.clone(),
                root: root.path().join("data"),
                removal: Removal::Whole,
            },
            CleanupTarget {
                id: "runtimes",
                path: root.path().join("data").join(RUNTIMES_DIR),
                root: root.path().join("data"),
                removal: Removal::Whole,
            },
        ];
        let mut log = null_log();
        assert_eq!(remove_all(&targets, None, &mut log), 1);
        assert!(kept.exists());
        assert!(!runtimes.exists());
    }

    #[test]
    fn a_folder_with_a_refused_entry_is_kept() {
        let root = Scratch::new("cleanup-kept-folder");
        let loc = locations_under(root.path());
        let model = root.touch("cache/models/a/weights.gguf");
        let target = CleanupTarget {
            id: "geniex-models",
            path: root.path().join("cache").join("models"),
            root: root.path().join("cache"),
            removal: Removal::ContentsThenFolder,
        };
        // A target whose root is the home folder is refused before anything is listed.
        let refused = CleanupTarget {
            root: root.path().join("home"),
            ..target.clone()
        };
        assert!(remove_target(&refused, loc.home.as_deref()).is_err());
        assert!(model.exists());
    }

    #[test]
    fn setup_leftovers_are_swept_even_without_delete_data() {
        let root = Scratch::new("cleanup-setup-leftovers");
        let data = root.path().join("data");
        let setup = root.touch("data/geniex-cli-setup-windows-arm64-v0.5.0.exe");
        let partial = root.touch("data/geniex-cli-setup-windows-arm64-v0.5.0.exe.part");
        let db = root.touch("data/localGenie.db");
        let mut log = null_log();
        assert_eq!(sweep_setup_leftovers(&data, &mut log), 0);
        assert!(!setup.exists());
        assert!(!partial.exists());
        assert!(db.exists(), "user data is kept without --delete-data");
    }

    #[test]
    fn log_lines_are_timestamped_and_name_the_step() {
        assert_eq!(
            format_line(1_700_000_000, "FAILED", "runtimes", "boom"),
            "[1700000000] FAILED runtimes: boom\n"
        );
    }

    #[test]
    fn log_file_collects_one_line_per_event() {
        let root = Scratch::new("cleanup-log");
        let path = root.path().join("log.txt");
        let mut log = CleanupLog::open(&path);
        log.event("OK", "runtimes", "removed x");
        log.event("FAILED", "database", "refused");
        let text = fs::read_to_string(&path).expect("log written");
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].ends_with("OK runtimes: removed x"));
        assert!(lines[1].ends_with("FAILED database: refused"));
    }

    #[test]
    fn app_identifier_matches_tauri_conf() {
        let conf = include_str!("../../tauri.conf.json");
        assert!(conf.contains(&format!("\"identifier\": \"{APP_IDENTIFIER}\"")));
    }
}
