use std::fs;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::process::Command;

use super::cli::get_installed_version_timeout;
use super::constants::{
    CLI_PROBE_TIMEOUT_SECS, GITHUB_TIMEOUT_SECS, INSTALLER_DOWNLOAD_TIMEOUT_SECS,
    UPDATE_POLL_ATTEMPTS, UPDATE_POLL_INTERVAL_SECS,
};
use std::path::PathBuf;

/// GitHub API endpoint for the latest GenieX release.
const GITHUB_RELEASES_URL: &str = "https://api.github.com/repos/qualcomm/GenieX/releases/latest";
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
/// Build a reqwest client with the LocalGenie user agent.
fn github_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("LocalGenie/0.1")
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Fetch the latest GenieX release JSON from the GitHub API.
async fn fetch_latest_release_json() -> Result<serde_json::Value, String> {
    let client = github_client(GITHUB_TIMEOUT_SECS)?;
    let resp = client
        .get(GITHUB_RELEASES_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub releases: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }
    resp.json()
        .await
        .map_err(|e| format!("Failed to parse GitHub release: {e}"))
}

/// Latest release tag (without a leading `v`) and its page URL.
fn release_tag_and_url(json: &serde_json::Value) -> Result<(String, String), String> {
    let tag = json
        .get("tag_name")
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();
    if tag.is_empty() {
        return Err("GitHub release response missing tag_name".to_string());
    }
    let url = json
        .get("html_url")
        .and_then(|u| u.as_str())
        .unwrap_or(RELEASE_BASE_URL)
        .to_string();
    Ok((tag, url))
}

/// Find the Windows ARM64 CLI installer asset URL in a release's assets list.
/// Returns the download URL and the suggested local file name.
fn find_arm64_installer(json: &serde_json::Value) -> Option<(String, String)> {
    let assets = json.get("assets").and_then(|a| a.as_array())?;
    assets.iter().find_map(|asset| {
        let name = asset
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or_default();
        let url = asset
            .get("browser_download_url")
            .and_then(|u| u.as_str())
            .unwrap_or_default();
        // e.g. "geniex-cli-setup-windows-arm64-v0.5.0.exe"
        let matches =
            name.contains("cli-setup") && name.contains("windows-arm64") && name.ends_with(".exe");
        matches.then(|| (url.to_string(), name.to_string()))
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
    let json = fetch_latest_release_json().await?;
    let (latest, _) = release_tag_and_url(&json)?;
    let (installer_url, installer_name) = find_arm64_installer(&json)
        .ok_or_else(|| "No Windows ARM64 CLI installer found in the latest release.".to_string())?;

    // 2. Download the installer.
    emit(format!("Downloading GenieX CLI v{latest}..."));
    let installer_path = download_installer(&app, &installer_url, &installer_name).await?;
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

/// Compare two dotted version strings. Returns `true` if `a < b`.
fn version_less_than(a: &str, b: &str) -> bool {
    let parse =
        |s: &str| -> Vec<u64> { s.split('.').filter_map(|p| p.parse::<u64>().ok()).collect() };
    let (pa, pb) = (parse(a), parse(b));
    let len = pa.len().max(pb.len());
    for i in 0..len {
        let x = pa.get(i).copied().unwrap_or(0);
        let y = pb.get(i).copied().unwrap_or(0);
        if x != y {
            return x < y;
        }
    }
    false
}

#[tauri::command]
pub async fn check_for_cli_update() -> Result<UpdateInfo, String> {
    let current = get_installed_version_timeout(CLI_PROBE_TIMEOUT_SECS)
        .await
        .ok_or_else(|| "GenieX CLI not found or did not respond in time.".to_string())?;

    let json = fetch_latest_release_json().await?;
    let (latest, release_url) = release_tag_and_url(&json)?;

    Ok(UpdateInfo {
        update_available: version_less_than(&current, &latest),
        current_version: current,
        latest_version: latest,
        release_url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_dotted_versions() {
        assert!(version_less_than("0.3.17", "0.5.0"));
        assert!(!version_less_than("0.5.0", "0.5.0"));
        assert!(!version_less_than("1.0", "0.9.9"));
        assert!(version_less_than("0.5", "0.5.1"));
    }

    #[test]
    fn finds_arm64_installer_asset() {
        let json = serde_json::json!({
            "assets": [
                { "name": "geniex-cli-setup-windows-x64-v0.5.0.exe", "browser_download_url": "x64" },
                { "name": "geniex-cli-setup-windows-arm64-v0.5.0.exe", "browser_download_url": "arm" }
            ]
        });
        assert_eq!(
            find_arm64_installer(&json),
            Some((
                "arm".into(),
                "geniex-cli-setup-windows-arm64-v0.5.0.exe".into()
            ))
        );
    }
}
