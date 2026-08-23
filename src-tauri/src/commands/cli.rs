use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::process::Command;
use tokio::time::timeout;

/// GitHub API endpoint for the latest GenieX release.
const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/qualcomm/GenieX/releases/latest";
/// Fallback release page when the API response is missing a URL.
const RELEASE_BASE_URL: &str = "https://github.com/qualcomm/GenieX/releases";

// GenieX is supported only on Windows on ARM64 for this project.
fn platform_supported() -> bool {
    cfg!(all(target_os = "windows", target_arch = "aarch64"))
}

/// Search common local install roots (APPDATA) for a geniex binary.
fn find_local_geniex_binary() -> Option<PathBuf> {
    if cfg!(target_os = "windows") {
        if let Some(appdata) = env::var_os("APPDATA") {
            let root = PathBuf::from(appdata).join("geniex-cli");
            if root.exists() {
                // Check common places quickly
                let candidates = [
                    root.join("geniex.exe"),
                    root.join("bin").join("geniex.exe"),
                    root.join("GenieX").join("geniex.exe"),
                ];
                for c in &candidates {
                    if c.exists() {
                        return Some(c.to_path_buf());
                    }
                }
                // Fallback: shallow walk (non-recursive heavy scan avoided)
                if let Ok(entries) = fs::read_dir(&root) {
                    for e in entries.flatten() {
                        let p = e.path();
                        if p.is_file() && p.file_name().and_then(|n| n.to_str()).map(|s| s.eq_ignore_ascii_case("geniex.exe")).unwrap_or(false) {
                            return Some(p);
                        }
                    }
                }
            }
        }
    }
    None
}

/// Search PATH for geniex.exe on Windows or geniex elsewhere.
fn find_in_path() -> Option<PathBuf> {
    if let Some(paths) = env::var_os("PATH") {
        for p in env::split_paths(&paths) {
            let candidate = if cfg!(windows) { p.join("geniex.exe") } else { p.join("geniex") };
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Determine an executable path to try. Prefer local install root, then PATH,
/// then a default name which will likely fail fast.
pub fn resolve_geniex_executable() -> PathBuf {
    if let Some(bin) = find_local_geniex_binary() {
        return bin;
    }
    if let Some(bin) = find_in_path() {
        return bin;
    }
    if cfg!(windows) {
        PathBuf::from("geniex.exe")
    } else {
        PathBuf::from("geniex")
    }
}

/// Run `geniex version` with a timeout and return parsed version string
/// (e.g. "0.3.17") on success.
async fn get_installed_version_timeout(secs: u64) -> Option<String> {
    let exe = resolve_geniex_executable();
    let mut cmd = Command::new(&exe);
    cmd.args(["version"]).stdout(Stdio::piped()).stderr(Stdio::null());

    // Use a timeout to ensure we don't hang forever on prompts or long runs.
    match timeout(Duration::from_secs(secs), cmd.output()).await {
        Ok(Ok(output)) => {
            if !output.status.success() {
                return None;
            }
            let stdout = String::from_utf8_lossy(&output.stdout);
            let first_line = stdout.lines().next().unwrap_or("").trim();
            if first_line.is_empty() {
                return None;
            }
            // Tokens like "v0.3.17" or "0.3.17" are expected; find the first token
            // that contains a dot and digits and strip a leading 'v'.
            for tok in first_line.split_whitespace() {
                let t = tok.trim_start_matches('v');
                if t.contains('.') && t.chars().any(|c| c.is_ascii_digit()) {
                    // Ensure token consists of digits and dots only after stripping
                    if t.chars().all(|c| c.is_ascii_digit() || c == '.') {
                        return Some(t.to_string());
                    }
                }
            }
            None
        }
        _ => None,
    }
}

#[tauri::command]
pub async fn check_geniex_installed() -> Result<bool, String> {
    if !platform_supported() {
        return Ok(false);
    }

    Ok(get_installed_version_timeout(5).await.is_some())
}

#[tauri::command]
pub async fn get_geniex_version() -> Result<String, String> {
    if !platform_supported() {
        return Err("GenieX CLI is only supported on Windows on ARM64 (aarch64).".to_string());
    }

    match get_installed_version_timeout(5).await {
        Some(v) => Ok(v),
        None => Err("GenieX CLI not found or did not respond in time.".to_string()),
    }
}

#[tauri::command]
pub async fn install_geniex(_app: tauri::AppHandle) -> Result<String, String> {
    Err("Automatic GenieX CLI installation is not supported in this build.\nGenieX is only available on Windows on ARM64 (aarch64).\nPlease download and install from: https://github.com/qualcomm/GenieX/releases".to_string())
}

#[tauri::command]
pub async fn config_get(key: String) -> Result<Option<String>, String> {
    if !platform_supported() {
        return Err("GenieX CLI is only supported on Windows on ARM64 (aarch64).".to_string());
    }

    let exe = resolve_geniex_executable();
    let output = timeout(Duration::from_secs(5), Command::new(exe).args(["config", "get", &key]).output()).await;
    match output {
        Ok(Ok(out)) if out.status.success() => {
            let val = String::from_utf8_lossy(&out.stdout).trim().to_string();
            Ok(if val.is_empty() { None } else { Some(val) })
        }
        Ok(Ok(out)) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            Err(format!("`geniex config get` failed: {stderr}"))
        }
        Ok(Err(e)) => Err(format!("Failed to run `geniex config get`: {e}")),
        Err(_) => Err("`geniex config get` timed out".to_string()),
    }
}

#[tauri::command]
pub async fn config_set(key: String, value: Option<String>) -> Result<(), String> {
    if !platform_supported() {
        return Err("GenieX CLI is only supported on Windows on ARM64 (aarch64).".to_string());
    }

    let exe = resolve_geniex_executable();
    let val = value.unwrap_or_default();
    let res = timeout(Duration::from_secs(10), Command::new(exe).args(["config", "set", &key, &val]).output()).await;
    match res {
        Ok(Ok(out)) if out.status.success() => Ok(()),
        Ok(Ok(out)) => Err(format!("`geniex config set` failed: {}", String::from_utf8_lossy(&out.stderr))),
        Ok(Err(e)) => Err(format!("Failed to run `geniex config set`: {e}")),
        Err(_) => Err("`geniex config set` timed out".to_string()),
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub async fn config_list() -> Result<Vec<ConfigEntry>, String> {
    if !platform_supported() {
        return Err("GenieX CLI is only supported on Windows on ARM64 (aarch64).".to_string());
    }

    let exe = resolve_geniex_executable();
    let res = timeout(Duration::from_secs(5), Command::new(exe).args(["config", "list"]).output()).await;
    match res {
        Ok(Ok(out)) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let entries: Vec<ConfigEntry> = stdout
                .lines()
                .filter_map(|line| {
                    let trimmed = line.trim();
                    if trimmed.is_empty() { return None; }
                    let (key, value) = if let Some(pos) = trimmed.find(':') {
                        (trimmed[..pos].trim().to_string(), trimmed[pos+1..].trim().to_string())
                    } else {
                        let first_ws = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
                        (trimmed[..first_ws].to_string(), trimmed[first_ws..].trim().to_string())
                    };
                    Some(ConfigEntry { key, value })
                })
                .collect();
            Ok(entries)
        }
        Ok(Ok(out)) => Err(format!("`geniex config list` failed: {}", String::from_utf8_lossy(&out.stderr))),
        Ok(Err(e)) => Err(format!("Failed to run `geniex config list`: {e}")),
        Err(_) => Err("`geniex config list` timed out".to_string()),
    }
}

/// Query the GitHub API for the latest GenieX release tag (e.g. "0.5.0").
async fn fetch_latest_release() -> Result<(String, String), String> {
    let client = reqwest::Client::builder()
        .user_agent("LocalGenie/0.1")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .get(GITHUB_RELEASES_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub releases: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub release: {e}"))?;

    let tag = json
        .get("tag_name")
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();
    let url = json
        .get("html_url")
        .and_then(|u| u.as_str())
        .unwrap_or(RELEASE_BASE_URL)
        .to_string();

    if tag.is_empty() {
        return Err("GitHub release response missing tag_name".to_string());
    }
    Ok((tag, url))
}

/// Find the Windows ARM64 CLI installer asset URL in a release's assets list.
/// Returns the download URL and the suggested local file name.
fn find_arm64_installer(json: &serde_json::Value) -> Option<(String, String)> {
    let assets = json
        .get("assets")
        .and_then(|a| a.as_array())
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    for asset in assets.iter() {
        let name = asset.get("name").and_then(|n| n.as_str()).unwrap_or_default();
        let url = asset.get("browser_download_url").and_then(|u| u.as_str()).unwrap_or_default();
        // Match the Windows ARM64 setup executable, e.g.
        // "geniex-cli-setup-windows-arm64-v0.5.0.exe"
        if name.contains("cli-setup") && name.contains("windows-arm64") && name.ends_with(".exe") {
            return Some((url.to_string(), name.to_string()));
        }
    }
    None
}

/// Download the latest Windows arm64 GenieX CLI installer to the app data dir.
async fn download_installer(app: tauri::AppHandle, url: &str, file_name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
    std::fs::create_dir_all(&dir).ok();
    let dest = dir.join(file_name);

    let client = reqwest::Client::builder()
        .user_agent("LocalGenie/0.1")
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

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

    std::fs::write(&dest, bytes).map_err(|e| format!("Failed to write installer: {e}"))?;

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
        let _ = app.emit("geniex-update-progress", serde_json::json!({ "message": msg }));
    };

    // 1. Resolve the latest release and its Windows arm64 installer.
    emit("Checking for the latest release...".to_string());
    let client = reqwest::Client::builder()
        .user_agent("LocalGenie/0.1")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let resp = client
        .get(GITHUB_RELEASES_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to reach GitHub releases: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API returned HTTP {}", resp.status()));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub release: {e}"))?;

    let latest = json
        .get("tag_name")
        .and_then(|t| t.as_str())
        .unwrap_or_default()
        .trim_start_matches('v')
        .to_string();
    if latest.is_empty() {
        return Err("GitHub release response missing tag_name".to_string());
    }

    let (installer_url, installer_name) = find_arm64_installer(&json)
        .ok_or_else(|| "No Windows ARM64 CLI installer found in the latest release.".to_string())?;

    // 2. Download the installer.
    emit(format!("Downloading GenieX CLI v{latest}..."));
    let installer_path = download_installer(app.clone(), &installer_url, &installer_name).await?;
    emit("Download complete. Launching the installer...".to_string());

    // 3. Launch the installer for the user to complete.
    launch_installer(&installer_path).await?;
    emit("Follow the installer steps to finish updating. Waiting for the version to change...".to_string());

    // 4. Poll the installed version until it reaches the latest release,
    //    expiring after 5 minutes (300s / 3s per check = 100 attempts).
    for _ in 0..100 {
        tokio::time::sleep(Duration::from_secs(3)).await;
        let v = get_installed_version_timeout(3).await;
        if v == Some(latest.clone()) {
            emit(format!("Updated to v{latest}"));
            return Ok(format!("Updated to v{latest}"));
        }
    }

    Err(format!(
        "The update did not complete within 5 minutes. Please run the installer manually from {}",
        RELEASE_BASE_URL
    ))
}

/// Compare two dotted version strings. Returns `true` if `a < b`.
fn version_less_than(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<u64> {
        s.split('.')
            .filter_map(|p| p.parse::<u64>().ok())
            .collect()
    };
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
pub async fn check_for_cli_update() -> Result<crate::commands::cli::UpdateInfo, String> {
    let current = get_installed_version_timeout(5)
        .await
        .ok_or_else(|| "GenieX CLI not found or did not respond in time.".to_string())?;

    let (latest, release_url) = fetch_latest_release().await?;

    let update_available = version_less_than(&current, &latest);

    Ok(crate::commands::cli::UpdateInfo {
        current_version: current,
        latest_version: latest,
        update_available,
        release_url,
    })
}

// Minimal UpdateInfo re-export for compatibility with other modules that refer to it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
}
