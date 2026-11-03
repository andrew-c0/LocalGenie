//! The GenieX CLI, an installer runtime. Its latest release ships a Windows ARM64 setup program: the
//! program is downloaded and checked, run silently, and `geniex version` is polled until it reports
//! the release. Removal runs the setup's Inno Setup uninstaller silently. The registry, progress
//! events and cancel flag are the ones the archive runtimes use (`mod.rs`).

use std::fs;
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
    remove_setup_files(&setup);
    Ok(release.tag)
}

/// Remove the GenieX CLI with its Inno Setup uninstaller, run silently. The server this app started
/// is stopped first, so its files are not locked. Emits no progress.
pub(super) async fn uninstall(state: &AppState) -> Result<(), String> {
    ensure_platform_supported()?;
    let binary = resolve_geniex_executable();
    let uninstaller = find_uninstaller(&binary).ok_or_else(|| {
        "Could not find the GenieX uninstaller. Remove it from Windows Settings > Apps.".to_string()
    })?;
    stop_tracked_server(state).await?;
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

/// Delete the setup program and its `.part` file, if any, after a verified install. Both removals
/// are best-effort: a file that cannot be deleted stays in the download folder.
fn remove_setup_files(setup: &Path) {
    let mut partial = setup.as_os_str().to_os_string();
    partial.push(".part");
    let _ = fs::remove_file(setup);
    let _ = fs::remove_file(PathBuf::from(partial));
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

    #[test]
    fn removes_the_setup_and_its_partial_file_only() {
        let root = Scratch::new("setup-cleanup");
        let setup = root.touch("geniex-cli-setup-windows-arm64-v0.5.0.exe");
        let partial = root.touch("geniex-cli-setup-windows-arm64-v0.5.0.exe.part");
        let other = root.touch("geniex-cli-setup-windows-x64-v0.4.0.exe");
        remove_setup_files(&setup);
        assert!(!setup.exists(), "the setup file is removed");
        assert!(!partial.exists(), "its partial file is removed");
        assert!(other.exists(), "other downloads are left alone");
    }

    #[test]
    fn cleanup_of_a_missing_setup_file_is_not_an_error() {
        let root = Scratch::new("setup-cleanup-missing");
        remove_setup_files(
            &root
                .path()
                .join("geniex-cli-setup-windows-arm64-v0.5.0.exe"),
        );
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
