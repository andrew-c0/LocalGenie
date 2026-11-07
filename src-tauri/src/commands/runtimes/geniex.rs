//! The GenieX CLI, an installer runtime. Its latest release ships a Windows ARM64 setup program: the
//! program is downloaded and checked, run silently, and `geniex version` is polled until it reports
//! the release. Removal runs the setup's Inno Setup uninstaller silently. The registry, progress
//! events and cancel flag are the ones the archive runtimes use (`mod.rs`).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tokio::process::{Child, Command};
use tokio::time::{timeout, Instant};

use super::install::{download_asset, stage_report, verify_download, InstallStage, Reporter};
use super::release::{release_api_url, Release, ReleaseAsset, ReleaseCache};
use super::spec::GENIEX;
use crate::commands::cli::{
    get_installed_version_timeout, platform_supported, platform_unsupported_err,
    resolve_geniex_executable,
};
use crate::commands::constants::{
    CLI_PROBE_TIMEOUT_SECS, UPDATE_POLL_ATTEMPTS, UPDATE_POLL_INTERVAL_SECS,
};
use crate::commands::server::kill_process;
use crate::commands::AppState;

/// `message` of the `installing` stage: the setup runs silently, then the version poll ends.
const INSTALLING_MESSAGE: &str = "Installing the GenieX CLI. Waiting for the version to change…";
/// Flags for the Inno Setup setup program and its uninstaller: no windows, no message boxes, no
/// reboot.
const SILENT_SETUP_ARGS: &[&str] = &["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"];
/// Uninstaller that the GenieX Inno Setup installer places beside the CLI.
const UNINSTALLER_FILE_NAME: &str = "unins000.exe";
/// Upper bound for the uninstaller process itself, in seconds.
const UNINSTALL_RUN_TIMEOUT_SECS: u64 = 120;
/// How long to wait for the CLI to disappear after the uninstaller exits, in seconds.
/// Inno Setup may re-launch itself from a temp copy and return before the removal is done.
const UNINSTALL_WAIT_SECS: u64 = 60;
/// Seconds between checks while waiting for the CLI to disappear.
const UNINSTALL_CHECK_INTERVAL_SECS: u64 = 2;
/// How long to wait for the setup program to exit once the version matches, in seconds. Windows
/// will not delete a running program, so the setup file is removed only after it has exited.
const SETUP_EXIT_WAIT_SECS: u64 = 60;
/// Tries, and the pause between them, to delete the new setup program once its install is verified.
/// Windows keeps a program locked while it runs, so a setup that has just exited may need a moment.
const SETUP_REMOVE_ATTEMPTS: u32 = 5;
const SETUP_REMOVE_RETRY_DELAY: Duration = Duration::from_secs(1);
/// File name parts of the GenieX setup programs and their partial downloads.
const SETUP_FILE_PREFIX: &str = "geniex-cli-setup-";
const SETUP_EXE_SUFFIX: &str = ".exe";
const SETUP_PARTIAL_SUFFIX: &str = ".exe.part";
/// Windows flag that keeps the setup programs from opening a console window.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The installed GenieX CLI version, or None when it is missing or the platform is unsupported.
pub(super) async fn installed_version() -> Option<String> {
    if !platform_supported() {
        return None;
    }
    get_installed_version_timeout(CLI_PROBE_TIMEOUT_SECS).await
}

/// The latest stable GenieX release, from the release cache when it is fresh.
pub(super) async fn latest_release(cache: &ReleaseCache) -> Result<Release, String> {
    cache
        .get_or_fetch(&release_api_url(GENIEX.repo, None), GENIEX.repo)
        .await
}

/// Download the latest setup program into `data_dir`, check it, run it silently and wait until
/// `geniex version` reports that release. Returns the version. The setup file is deleted once the
/// install is verified; a failed or cancelled install keeps it (a partial download resumes on retry). `report`
/// gets each stage; the caller reports `done` or `error`.
pub(super) async fn install(
    client: &reqwest::Client,
    cancel: &AtomicBool,
    cache: &ReleaseCache,
    data_dir: &Path,
    report: Reporter<'_>,
) -> Result<String, String> {
    ensure_platform_supported()?;
    stage_report(
        report,
        &GENIEX,
        InstallStage::Checking,
        "Looking up the release",
    );
    let release = latest_release(cache).await?;
    let installer = find_arm64_installer(&release.assets)
        .ok_or_else(|| "No Windows ARM64 CLI installer found in the latest release.".to_string())?;

    let setup = download_asset(client, cancel, data_dir, &GENIEX, installer, report).await?;
    verify_download(report, &GENIEX, &setup, installer.sha256.as_deref()).await?;

    stage_report(
        report,
        &GENIEX,
        InstallStage::Installing,
        INSTALLING_MESSAGE,
    );
    let mut setup_process = launch_installer(&setup)?;
    wait_for_version(&release, cancel).await?;
    wait_for_setup_exit(&mut setup_process).await;
    remove_setup_files(data_dir, &setup).await;
    Ok(release.tag)
}

/// Remove the GenieX CLI with its Inno Setup uninstaller, run silently. The server this app started
/// is stopped first, so its files are not locked. Emits no progress.
pub(super) async fn uninstall(state: &AppState) -> Result<(), String> {
    ensure_platform_supported()?;
    stop_tracked_server(state).await?;
    uninstall_cli().await
}

/// Remove the GenieX CLI silently with its uninstaller, without app state. The headless cleanup
/// calls it directly. Fails when the uninstaller is missing, or when the CLI is still installed
/// after it ran.
pub(crate) async fn uninstall_cli() -> Result<(), String> {
    ensure_platform_supported()?;
    let uninstaller = find_uninstaller(&resolve_geniex_executable()).ok_or_else(|| {
        "Could not find the GenieX uninstaller. Remove it from Windows Settings > Apps.".to_string()
    })?;
    run_uninstaller(&uninstaller).await?;
    wait_for_cli_removal().await
}

/// Installing and removing run only on Windows ARM64, the platform the GenieX CLI ships for.
fn ensure_platform_supported() -> Result<(), String> {
    if platform_supported() {
        Ok(())
    } else {
        Err(platform_unsupported_err())
    }
}

/// The Windows arm64 CLI installer asset of a release.
fn find_arm64_installer(assets: &[ReleaseAsset]) -> Option<&ReleaseAsset> {
    // e.g. "geniex-cli-setup-windows-arm64-v0.5.0.exe"
    assets.iter().find(|asset| {
        asset.name.contains("cli-setup")
            && asset.name.contains("windows-arm64")
            && asset.name.ends_with(".exe")
    })
}

/// A command for a setup program: `args` are passed, no stdin is read, and on Windows no console
/// window opens.
fn silent_command(program: &Path, args: &[&str]) -> Command {
    let mut command = Command::new(program);
    command.args(args).stdin(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

/// Start the setup program silently. It is not waited for here: the version poll ends the install,
/// and a cancel leaves the setup running. Dropping the returned handle does not stop it.
fn launch_installer(setup: &Path) -> Result<Child, String> {
    silent_command(setup, SILENT_SETUP_ARGS)
        .spawn()
        .map_err(|e| format!("Failed to launch installer: {e}"))
}

/// Poll the installed version until it matches `release`. The setup program keeps running if the
/// user cancels here; only the wait stops.
async fn wait_for_version(release: &Release, cancel: &AtomicBool) -> Result<(), String> {
    for _ in 0..UPDATE_POLL_ATTEMPTS {
        tokio::time::sleep(Duration::from_secs(UPDATE_POLL_INTERVAL_SECS)).await;
        if cancel.load(Ordering::Relaxed) {
            return Err("The GenieX CLI install was cancelled".to_string());
        }
        if installed_version().await.as_deref() == Some(release.tag.as_str()) {
            return Ok(());
        }
    }
    Err(format!(
        "The install did not complete within 5 minutes. Please run the installer manually from {}",
        release.page_url
    ))
}

/// Give the setup program a short time to exit after the version matches. A setup still running
/// after that is left alone; its file is then not deleted.
async fn wait_for_setup_exit(setup: &mut Child) {
    let _ = timeout(Duration::from_secs(SETUP_EXIT_WAIT_SECS), setup.wait()).await;
}

/// Delete the new setup program after a verified install, retrying while Windows still holds it,
/// then sweep every other setup leftover from `data_dir`. A file that stays is reported on stderr.
async fn remove_setup_files(data_dir: &Path, setup: &Path) {
    if let Err(e) =
        remove_file_with_retries(setup, SETUP_REMOVE_ATTEMPTS, SETUP_REMOVE_RETRY_DELAY).await
    {
        eprintln!(
            "[runtimes] could not remove the GenieX setup {}: {e}",
            setup.display()
        );
    }
    let report = sweep_setup_files(data_dir, Some(setup), SetupLeftovers::WithPartials);
    report_failures(&report);
}

/// Delete `path`, trying `attempts` times with `delay` between tries. A file that is already gone
/// counts as deleted. Returns the last error when every try fails.
async fn remove_file_with_retries(
    path: &Path,
    attempts: u32,
    delay: Duration,
) -> Result<(), String> {
    let mut last_error = String::from("no attempt was made");
    for attempt in 1..=attempts {
        match fs::remove_file(path) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(e) => last_error = e.to_string(),
        }
        if attempt < attempts {
            tokio::time::sleep(delay).await;
        }
    }
    Err(last_error)
}

/// Which setup leftovers a sweep removes. A partial download is kept at startup, so a retry after a
/// restart resumes it. It is removed only after a verified install, or when uninstalling.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SetupLeftovers {
    /// Finished setup programs (`geniex-cli-setup-*.exe`) only.
    Finished,
    /// Finished setup programs and their `.exe.part` partial downloads.
    WithPartials,
}

/// What a sweep did: the files it removed, and the files it could not remove with the error.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct SweepReport {
    pub(crate) removed: Vec<PathBuf>,
    pub(crate) failed: Vec<(PathBuf, String)>,
}

/// True when `name` is a GenieX setup program, or, for `WithPartials`, its partial download.
fn is_setup_leftover(name: &str, leftovers: SetupLeftovers) -> bool {
    name.starts_with(SETUP_FILE_PREFIX)
        && (name.ends_with(SETUP_EXE_SUFFIX)
            || (leftovers == SetupLeftovers::WithPartials && name.ends_with(SETUP_PARTIAL_SUFFIX)))
}

/// Delete the GenieX setup leftovers directly in `dir`, except `keep`. Subfolders, links and other
/// names are left alone; nothing is searched recursively. Best effort: a file that cannot be deleted
/// (Windows keeps a running program locked) is listed in `failed`, and the sweep goes on.
pub(crate) fn sweep_setup_files(
    dir: &Path,
    keep: Option<&Path>,
    leftovers: SetupLeftovers,
) -> SweepReport {
    let mut report = SweepReport::default();
    let Ok(entries) = fs::read_dir(dir) else {
        return report;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name_matches = entry
            .file_name()
            .to_str()
            .is_some_and(|name| is_setup_leftover(name, leftovers));
        // `file_type` does not follow links, so a link named like a setup file is skipped.
        let is_plain_file = entry.file_type().is_ok_and(|kind| kind.is_file());
        if !name_matches || !is_plain_file || keep == Some(path.as_path()) {
            continue;
        }
        match fs::remove_file(&path) {
            Ok(()) => report.removed.push(path),
            Err(e) => report.failed.push((path, e.to_string())),
        }
    }
    report
}

/// Startup sweep of the app data folder: finished setup programs from earlier runs are removed,
/// partial downloads are kept. Called on a background thread, so the window is not delayed.
pub(crate) fn sweep_stale_setup_files(data_dir: &Path) {
    report_failures(&sweep_setup_files(data_dir, None, SetupLeftovers::Finished));
}

/// Log each file a sweep could not remove, on stderr.
fn report_failures(report: &SweepReport) {
    for (path, error) in &report.failed {
        eprintln!("[runtimes] could not remove {}: {error}", path.display());
    }
}

/// Kill the server this app started. The PID is taken out of the state first, as `stop_server`
/// does, so the exit watcher does not report the stop as an unexpected exit.
async fn stop_tracked_server(state: &AppState) -> Result<(), String> {
    let tracked = state
        .server_process
        .lock()
        .map_err(|_| "server state is unavailable".to_string())?
        .take();
    if let Some(pid) = tracked {
        kill_process(pid).await;
    }
    Ok(())
}

/// The parent folder of `path`, unless it is empty (a bare file name has an empty parent,
/// which must not resolve against the working directory).
fn non_empty_parent(path: &Path) -> Option<&Path> {
    path.parent().filter(|p| !p.as_os_str().is_empty())
}

/// Find `unins000.exe` in the folder of the CLI binary, or in that folder's parent (the binary
/// may sit in a `bin` subfolder). The binary's own folder wins when both have one.
fn find_uninstaller(binary: &Path) -> Option<PathBuf> {
    let dir = non_empty_parent(binary)?;
    [Some(dir), non_empty_parent(dir)]
        .into_iter()
        .flatten()
        .map(|folder| folder.join(UNINSTALLER_FILE_NAME))
        .find(|candidate| candidate.is_file())
}

/// Run the uninstaller silently. An exit with an error only counts as a failure when the CLI is
/// still installed afterwards.
async fn run_uninstaller(uninstaller: &Path) -> Result<(), String> {
    let mut command = silent_command(uninstaller, SILENT_SETUP_ARGS);
    command.kill_on_drop(true);
    let status = timeout(
        Duration::from_secs(UNINSTALL_RUN_TIMEOUT_SECS),
        command.status(),
    )
    .await
    .map_err(|_| "The uninstaller did not finish.".to_string())?
    .map_err(|e| format!("Failed to run the uninstaller: {e}"))?;

    if status.success() || installed_version().await.is_none() {
        return Ok(());
    }
    let code = status
        .code()
        .map_or_else(|| "unknown".to_string(), |c| c.to_string());
    Err(format!(
        "The uninstaller exited with code {code} and the GenieX CLI is still installed."
    ))
}

/// Poll `geniex version` until the CLI no longer answers, or the wait limit passes.
async fn wait_for_cli_removal() -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(UNINSTALL_WAIT_SECS);
    loop {
        if installed_version().await.is_none() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("The uninstaller did not finish.".to_string());
        }
        tokio::time::sleep(Duration::from_secs(UNINSTALL_CHECK_INTERVAL_SECS)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::Scratch;
    use super::*;

    #[test]
    fn finds_arm64_installer_asset() {
        let asset = |name: &str, url: &str| ReleaseAsset {
            name: name.into(),
            download_url: url.into(),
            sha256: None,
        };
        let assets = [
            asset("geniex-cli-setup-windows-x64-v0.5.0.exe", "x64"),
            asset("geniex-cli-setup-windows-arm64-v0.5.0.exe", "arm"),
        ];
        let found = find_arm64_installer(&assets).expect("installer found");
        assert_eq!(found.download_url, "arm");
        assert_eq!(found.name, "geniex-cli-setup-windows-arm64-v0.5.0.exe");
    }

    #[test]
    fn setup_programs_run_fully_silent_without_a_reboot() {
        assert_eq!(
            SILENT_SETUP_ARGS,
            ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"].as_slice()
        );
    }

    /// Run a future to completion on a fresh current-thread runtime.
    fn block_on<F: std::future::Future>(future: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(future)
    }

    #[cfg(windows)]
    fn lock_file(path: &Path) -> fs::File {
        use std::os::windows::fs::OpenOptionsExt;
        // Share mode 0 refuses deletion while the handle is open, as for a running program.
        fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(path)
            .expect("lock the file")
    }

    #[cfg(windows)]
    fn make_file_link(target: &Path, link: &Path) -> bool {
        std::os::windows::fs::symlink_file(target, link).is_ok()
    }

    #[cfg(unix)]
    fn make_file_link(target: &Path, link: &Path) -> bool {
        std::os::unix::fs::symlink(target, link).is_ok()
    }

    #[test]
    fn after_an_install_the_new_setup_its_partial_and_older_setups_are_removed() {
        let root = Scratch::new("setup-cleanup");
        let setup = root.touch("geniex-cli-setup-windows-arm64-v0.5.0.exe");
        let partial = root.touch("geniex-cli-setup-windows-arm64-v0.5.0.exe.part");
        let older = root.touch("geniex-cli-setup-windows-arm64-v0.4.0.exe");
        let other = root.touch("other.exe");
        block_on(remove_setup_files(root.path(), &setup));
        assert!(!setup.exists(), "the new setup file is removed");
        assert!(!partial.exists(), "its partial file is removed");
        assert!(!older.exists(), "an older setup file is swept");
        assert!(other.exists(), "other downloads are left alone");
    }

    #[test]
    fn sweep_matches_only_the_setup_names() {
        let root = Scratch::new("sweep-names");
        let swept = [
            root.touch("geniex-cli-setup-x.exe"),
            root.touch("geniex-cli-setup-x.exe.part"),
        ];
        let kept = [
            root.touch("other.exe"),
            root.touch("geniex-cli-setup-x.txt"),
            root.touch("geniex-cli-setup-x.exe.bak"),
            root.touch("xgeniex-cli-setup-x.exe"),
            root.touch("geniex-cli-setup-x.exe.part.txt"),
        ];
        let report = sweep_setup_files(root.path(), None, SetupLeftovers::WithPartials);
        assert!(report.failed.is_empty());
        assert_eq!(report.removed.len(), swept.len());
        assert!(swept.iter().all(|path| !path.exists()));
        assert!(kept.iter().all(|path| path.exists()));
    }

    #[test]
    fn finished_mode_keeps_partial_downloads() {
        let root = Scratch::new("sweep-finished");
        let exe = root.touch("geniex-cli-setup-x.exe");
        let partial = root.touch("geniex-cli-setup-x.exe.part");
        let report = sweep_setup_files(root.path(), None, SetupLeftovers::Finished);
        assert!(!exe.exists());
        assert!(partial.exists(), "a partial download is kept for a resume");
        assert_eq!(report.removed, [exe]);
    }

    #[test]
    fn the_kept_file_is_never_swept() {
        let root = Scratch::new("sweep-keep");
        let keep = root.touch("geniex-cli-setup-new.exe");
        let old = root.touch("geniex-cli-setup-old.exe");
        let report = sweep_setup_files(root.path(), Some(&keep), SetupLeftovers::WithPartials);
        assert!(keep.exists());
        assert!(!old.exists());
        assert_eq!(report.removed, [old]);
    }

    #[test]
    fn subfolders_and_links_with_setup_names_are_left_alone() {
        let root = Scratch::new("sweep-subfolders");
        let folder_file = root.touch("geniex-cli-setup-dir.exe/inside.txt");
        let nested = root.touch("nested/geniex-cli-setup-n.exe");
        let target = root.touch("target.bin");
        let link = root.path().join("geniex-cli-setup-link.exe");
        let link_made = make_file_link(&target, &link);
        let report = sweep_setup_files(root.path(), None, SetupLeftovers::WithPartials);
        assert!(report.removed.is_empty() && report.failed.is_empty());
        assert!(folder_file.exists(), "a folder with a setup name is kept");
        assert!(nested.exists(), "the sweep is not recursive");
        assert!(target.exists());
        if link_made {
            assert!(
                link.symlink_metadata().is_ok(),
                "a link is not followed or removed"
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn a_locked_setup_is_reported_and_left_in_place() {
        let root = Scratch::new("sweep-locked");
        let locked = root.touch("geniex-cli-setup-locked.exe");
        let lock = lock_file(&locked);
        let report = sweep_setup_files(root.path(), None, SetupLeftovers::WithPartials);
        assert_eq!(report.failed.len(), 1);
        assert!(locked.exists());
        drop(lock);
    }

    #[test]
    fn retry_treats_a_missing_file_as_removed() {
        let root = Scratch::new("retry-missing");
        let missing = root.path().join("geniex-cli-setup-gone.exe");
        assert!(block_on(remove_file_with_retries(&missing, 3, Duration::ZERO)).is_ok());
    }

    #[test]
    fn retry_gives_up_after_its_attempts() {
        let root = Scratch::new("retry-give-up");
        // A folder cannot be deleted as a file, so every attempt fails.
        let stuck = root.path().join("geniex-cli-setup-stuck.exe");
        fs::create_dir_all(&stuck).expect("folder");
        assert!(block_on(remove_file_with_retries(&stuck, 3, Duration::ZERO)).is_err());
        assert!(stuck.is_dir());
    }

    #[cfg(windows)]
    #[test]
    fn retry_succeeds_once_the_lock_is_released() {
        let root = Scratch::new("retry-released");
        let path = root.touch("geniex-cli-setup-busy.exe");
        let lock = lock_file(&path);
        let release = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            drop(lock);
        });
        let result = block_on(remove_file_with_retries(
            &path,
            100,
            Duration::from_millis(10),
        ));
        release.join().expect("the lock is released");
        assert!(result.is_ok());
        assert!(!path.exists());
    }

    #[test]
    fn finds_uninstaller_beside_the_binary() {
        let root = Scratch::new("uninstall-beside");
        let binary = root.touch("geniex.exe");
        let uninstaller = root.touch(UNINSTALLER_FILE_NAME);
        assert_eq!(find_uninstaller(&binary), Some(uninstaller));
    }

    #[test]
    fn finds_uninstaller_in_the_parent_of_a_bin_folder() {
        let root = Scratch::new("uninstall-parent");
        let binary = root.touch("bin/geniex.exe");
        let uninstaller = root.touch(UNINSTALLER_FILE_NAME);
        assert_eq!(find_uninstaller(&binary), Some(uninstaller));
    }

    #[test]
    fn prefers_the_binary_folder_over_its_parent() {
        let root = Scratch::new("uninstall-prefer");
        let binary = root.touch("bin/geniex.exe");
        let nearest = root.touch(&format!("bin/{UNINSTALLER_FILE_NAME}"));
        root.touch(UNINSTALLER_FILE_NAME);
        assert_eq!(find_uninstaller(&binary), Some(nearest));
    }

    #[test]
    fn no_uninstaller_means_none() {
        let root = Scratch::new("uninstall-missing");
        let binary = root.touch("bin/geniex.exe");
        assert_eq!(find_uninstaller(&binary), None);
    }

    #[test]
    fn bare_binary_name_never_resolves_against_the_working_directory() {
        assert_eq!(find_uninstaller(Path::new("geniex.exe")), None);
    }
}
