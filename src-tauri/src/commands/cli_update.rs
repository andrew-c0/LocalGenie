use std::fs;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::process::Command;

use super::cli::get_installed_version_timeout;
use super::constants::{
    CLI_PROBE_TIMEOUT_SECS, INSTALLER_DOWNLOAD_TIMEOUT_SECS, UPDATE_POLL_ATTEMPTS,
    UPDATE_POLL_INTERVAL_SECS,
};
use super::runtimes::release::{
    fetch_release_json, github_client, parse_release, release_api_url, version_less_than, Release,
    ReleaseAsset,
};
use std::path::PathBuf;

/// GitHub repository of the GenieX CLI.
const GENIEX_REPO: &str = "qualcomm/GenieX";
/// Fallback release page when the API response is missing a URL.
const RELEASE_BASE_URL: &str = "https://github.com/qualcomm/GenieX/releases";
/// Version comparison result for the GenieX CLI.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
}

/// The latest GenieX release, read from GitHub (not cached: the CLI check must be live).
async fn fetch_geniex_release() -> Result<Release, String> {
    let json = fetch_release_json(&release_api_url(GENIEX_REPO, None)).await?;
    parse_release(&json, GENIEX_REPO)
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

/// Download the latest Windows arm64 GenieX CLI installer to the app data dir.
async fn download_installer(
    app: &tauri::AppHandle,
    url: &str,
    file_name: &str,
) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;
    let dest = dir.join(file_name);

    let client = github_client(INSTALLER_DOWNLOAD_TIMEOUT_SECS)?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download installer: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download failed with HTTP {}", resp.status()));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read installer body: {e}"))?;

    fs::write(&dest, bytes).map_err(|e| format!("Failed to write installer: {e}"))?;
    Ok(dest)
}

/// Launch the installer so the user can complete the update.
async fn launch_installer(path: &PathBuf) -> Result<(), String> {
    Command::new(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Failed to launch installer: {e}"))
}

#[tauri::command]
pub async fn update_geniex(app: tauri::AppHandle) -> Result<String, String> {
    let emit = |msg: String| {
        let _ = app.emit(
            "geniex-update-progress",
            serde_json::json!({ "message": msg }),
        );
    };

    // 1. Resolve the latest release and its Windows arm64 installer.
    emit("Checking for the latest release...".to_string());
    let release = fetch_geniex_release().await?;
    let latest = release.tag.clone();
    let installer = find_arm64_installer(&release.assets)
        .ok_or_else(|| "No Windows ARM64 CLI installer found in the latest release.".to_string())?;

    // 2. Download the installer.
    emit(format!("Downloading GenieX CLI v{latest}..."));
    let installer_path = download_installer(&app, &installer.download_url, &installer.name).await?;
    emit("Download complete. Launching the installer...".to_string());

    // 3. Launch the installer for the user to complete.
    launch_installer(&installer_path).await?;
    emit(
        "Follow the installer steps to finish updating. Waiting for the version to change..."
            .to_string(),
    );

    // 4. Poll the installed version until it matches the latest release.
    for _ in 0..UPDATE_POLL_ATTEMPTS {
        tokio::time::sleep(Duration::from_secs(UPDATE_POLL_INTERVAL_SECS)).await;
        if get_installed_version_timeout(CLI_PROBE_TIMEOUT_SECS)
            .await
            .as_deref()
            == Some(latest.as_str())
        {
            let msg = format!("Updated to v{latest}");
            emit(msg.clone());
            return Ok(msg);
        }
    }

    Err(format!(
        "The update did not complete within 5 minutes. Please run the installer manually from {RELEASE_BASE_URL}"
    ))
}

#[tauri::command]
pub async fn check_for_cli_update() -> Result<UpdateInfo, String> {
    let current = get_installed_version_timeout(CLI_PROBE_TIMEOUT_SECS)
        .await
        .ok_or_else(|| "GenieX CLI not found or did not respond in time.".to_string())?;

    let release = fetch_geniex_release().await?;

    Ok(UpdateInfo {
        update_available: version_less_than(&current, &release.tag),
        current_version: current,
        latest_version: release.tag,
        release_url: release.page_url,
    })
}

#[cfg(test)]
mod tests {
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
}
