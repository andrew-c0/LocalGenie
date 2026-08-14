use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::error::Error;
use tauri::Emitter;
use tokio::process::Command;

/// GitHub API URL for the latest GenieX release.
const GITHUB_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/qualcomm/GenieX/releases/latest";

const LOCAL_GENIEX_DIR: &str = "geniex-cli";

fn local_geniex_install_root() -> Option<PathBuf> {
    let base_dir = match std::env::consts::OS {
        "windows" => std::env::var_os("APPDATA").map(PathBuf::from),
        "macos" => std::env::var_os("HOME").map(PathBuf::from).map(|p| p.join("Library").join("Application Support")),
        _ => std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(PathBuf::from).map(|p| p.join(".local").join("share"))),
    };

    base_dir.map(|dir| dir.join(LOCAL_GENIEX_DIR))
}

fn local_geniex_binary_name() -> &'static str {
    if cfg!(windows) {
        "geniex.exe"
    } else {
        "geniex"
    }
}

fn find_local_geniex_binary(root: &Path) -> Option<PathBuf> {
    if !root.exists() {
        return None;
    }

    let mut stack = vec![root.to_path_buf()];
    while let Some(path) = stack.pop() {
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name == local_geniex_binary_name() {
                    return Some(path);
                }
            }
        } else if let Ok(entries) = fs::read_dir(&path) {
            for entry in entries.flatten() {
                stack.push(entry.path());
            }
        }
    }
    None
}

pub fn get_geniex_executable() -> PathBuf {
    if let Some(root) = local_geniex_install_root() {
        if let Some(binary) = find_local_geniex_binary(&root) {
            return binary;
        }
    }
    PathBuf::from("geniex")
}

fn normalize_arch(arch: &str) -> Option<&'static str> {
    match arch {
        "aarch64" => Some("arm64"),
        "x86_64" => Some("x86_64"),
        "x86" => Some("x86"),
        _ => None,
    }
}

fn download_asset_name() -> Option<(&'static str, &'static str)> {
    let os = std::env::consts::OS;

    match os {
        "windows" => Some(("geniex-cli-setup-windows-", ".exe")),
        "linux" => Some(("geniex-cli-linux-", ".tar.gz")),
        "macos" => Some(("geniex-cli-macos-", ".tar.gz")),
        _ => None,
    }
}

async fn fetch_latest_release_json() -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("LocalGenie")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = client
        .get(GITHUB_LATEST_RELEASE_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest release: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {e}"))
}

fn select_release_asset(release: &serde_json::Value) -> Result<(String, String), String> {
    let (prefix, suffix) = download_asset_name().ok_or_else(|| {
        "Unsupported operating system for automatic GenieX CLI installation. Visit https://github.com/qualcomm/GenieX/releases to install manually.".to_string()
    })?;

    let assets = release["assets"].as_array().ok_or_else(|| {
        "No release assets found for GenieX.".to_string()
    })?;

    let arch = normalize_arch(std::env::consts::ARCH).unwrap_or("");
    for asset in assets {
        let name = asset["name"].as_str().unwrap_or("");
        let download_url = asset["browser_download_url"].as_str().unwrap_or("");
        if name.starts_with(prefix) && name.contains(arch) && name.ends_with(suffix) && !name.ends_with(".sha256") {
            return Ok((name.to_string(), download_url.to_string()));
        }
    }

    Err("Could not find a matching GenieX CLI release asset for this device. Install manually from https://github.com/qualcomm/GenieX/releases.".to_string())
}

async fn download_file(url: &str, destination: &Path) -> Result<(), String> {
    // On Windows, prefer the system `curl.exe` (uses the OS network stack,
    // trusts the system CA store, and handles GitHub redirects) before falling
    // back to the in-process reqwest client.
    #[cfg(target_os = "windows")]
    {
        if let Ok(()) = download_with_curl(url, destination).await {
            return Ok(());
        }
    }

    download_with_reqwest(url, destination).await
}

#[cfg(target_os = "windows")]
async fn download_with_curl(url: &str, destination: &Path) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create download directory: {e}"))?;
    }

    let status = Command::new("curl.exe")
        .args(["-L", "--fail", "--silent", "--show-error"])
        .arg("-o")
        .arg(destination)
        .arg(url)
        .status()
        .await
        .map_err(|e| format!("Failed to run curl: {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("curl download failed with exit status {}", status))
    }
}

async fn download_with_reqwest(url: &str, destination: &Path) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    // Create a client once and reuse for HEAD + GET attempts
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .user_agent("LocalGenie")
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let mut last_err: Option<String> = None;
    // Retry a few times in case of transient network errors
    for attempt in 1..=3 {
        match client.get(url).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    last_err = Some(format!("Download failed: HTTP {}", response.status()));
                } else {
                    if let Some(parent) = destination.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create download directory: {e}"))?;
                    }

                    let mut file = tokio::fs::File::create(destination)
                        .await
                        .map_err(|e| format!("Failed to create download file: {e}"))?;

                    let mut stream = response.bytes_stream();
                    while let Some(chunk) = stream.next().await {
                        let chunk = match chunk {
                            Ok(c) => c,
                            Err(e) => {
                                last_err = Some(format!("Failed to read download stream: {e}"));
                                break;
                            }
                        };
                        if let Err(e) = file.write_all(&chunk).await {
                            last_err = Some(format!("Failed to write downloaded file: {e}"));
                            break;
                        }
                    }

                    // If no error occurred, the download is complete.
                    if last_err.is_none() {
                        return Ok(());
                    }
                }
            }
            Err(e) => {
                // Capture as much diagnostic info as possible
                let mut err_msg = format!("Request error: {e}");
                if let Some(source) = e.source() {
                    err_msg.push_str(&format!("; cause: {source}"));
                }
                last_err = Some(err_msg);
            }
        }

        // Backoff before retrying
        if attempt < 3 {
            let backoff_ms = 500u64 * (2u64.pow((attempt - 1) as u32));
            tokio::time::sleep(std::time::Duration::from_millis(backoff_ms)).await;
        }
    }

    Err(last_err.unwrap_or_else(|| "Failed to download asset: unknown error".to_string()))
}

fn set_executable_permission(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path)
            .map_err(|e| format!("Failed to read permissions: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(path, perms)
            .map_err(|e| format!("Failed to set executable permissions: {e}"))?;
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
    Ok(())
}

fn extract_tarball(source: &Path, destination: &Path) -> Result<PathBuf, String> {
    let file = fs::File::open(source)
        .map_err(|e| format!("Failed to open downloaded archive: {e}"))?;
    let decompressor = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(decompressor);
    archive
        .unpack(destination)
        .map_err(|e| format!("Failed to extract archive: {e}"))?;

    if let Some(binary) = find_local_geniex_binary(destination) {
        set_executable_permission(&binary)?;
        Ok(binary)
    } else {
        Err("Archive extracted but no geniex binary was found.".to_string())
    }
}

#[tauri::command]
pub async fn install_geniex(app: tauri::AppHandle) -> Result<String, String> {
    let release = fetch_latest_release_json().await?;
    let (name, download_url) = select_release_asset(&release)?;
    let temp_dir = std::env::temp_dir().join("localgenie-geniex-download");
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temporary download directory: {e}"))?;

    let download_path = temp_dir.join(&name);
    if download_path.exists() {
        tokio::fs::remove_file(&download_path)
            .await
            .map_err(|e| format!("Failed to remove stale download file: {e}"))?;
    }

    if let Err(dl_err) = download_file(&download_url, &download_path).await {
        let release_url = release["html_url"]
            .as_str()
            .unwrap_or("https://github.com/qualcomm/GenieX/releases");
        return Err(format!(
            "Failed to download asset: {}. You can download manually from {}",
            dl_err, release_url
        ));
    }

    if std::env::consts::OS == "windows" {
        // Use the shell "start" command to launch the installer detached so the
        // installer can run even if this process exits and so Windows can
        // perform any elevation prompts. If that fails, open Explorer and
        // select the downloaded file to let the user run it manually.
        let installer_path = download_path.to_string_lossy().to_string();
        let start_cmd = Command::new("cmd")
            .args(["/C", "start", "", &installer_path])
            .spawn();

        match start_cmd {
            Ok(_) => {
                // Spawn a background checker that polls for up to 5 minutes to
                // detect whether the CLI becomes available. This checks both
                // `geniex version` on PATH and the local install root for the
                // binary (covers installers that write into AppData without
                // updating the current process environment).
                let app_handle = app.clone();
                                tokio::spawn(async move {
                    let start_time = std::time::Instant::now();
                    let timeout = std::time::Duration::from_secs(300); // 5 minutes
                    let poll_interval = std::time::Duration::from_secs(5);
                    let mut attempt: u32 = 0;
                    loop {
                        attempt += 1;
                        // First, try to read an installed version via PATH.
                        if let Some(ver) = get_installed_version().await {
                            let _ = app_handle.emit(
                                "geniex-install-status",
                                serde_json::json!({
                                    "installed": true,
                                    "method": "path",
                                    "version": ver,
                                    "attempt": attempt,
                                }),
                            );
                            break;
                        }

                        // Second, check the expected local install root for the binary.
                        if let Some(root) = local_geniex_install_root() {
                            if let Some(bin) = find_local_geniex_binary(&root) {
                                let _ = app_handle.emit(
                                    "geniex-install-status",
                                    serde_json::json!({
                                        "installed": true,
                                        "method": "local_root",
                                        "path": bin.display().to_string(),
                                        "attempt": attempt,
                                    }),
                                );
                                break;
                            }
                        }

                        // Emit a progress heartbeat so the frontend can show status.
                        let _ = app_handle.emit(
                            "geniex-install-progress",
                            serde_json::json!({
                                "installed": false,
                                "attempt": attempt,
                            }),
                        );

                        if start_time.elapsed() >= timeout {
                            let _ = app_handle.emit(
                                "geniex-install-status",
                                serde_json::json!({
                                    "installed": false,
                                    "timeout": true,
                                    "attempts": attempt,
                                }),
                            );
                            break;
                        }

                        tokio::time::sleep(poll_interval).await;
                    }
                });

                Ok(format!("Downloaded {} and launched the installer.", name))
            }
            Err(start_err) => {
                // Fallback: try to open File Explorer with the file selected
                let explorer_cmd = Command::new("explorer")
                                    .args(["/select,", &download_path.to_string_lossy()])
                                    .spawn();

                if explorer_cmd.is_ok() {
                    return Ok(format!(
                        "Downloaded {} but launching the installer failed: {}. The download folder was opened — please run the installer manually.",
                        name, start_err
                    ));
                }

                // As a final fallback, return an error with a clear manual URL.
                let release_url = release["html_url"]
                    .as_str()
                    .unwrap_or("https://github.com/qualcomm/GenieX/releases");
                Err(format!(
                    "Downloaded {} but failed to launch installer (start error: {}). Please run {} manually or download from {}",
                    name, start_err, download_path.display(), release_url
                ))
            }
        }
    } else {
        let install_root = local_geniex_install_root().ok_or_else(|| {
            "Failed to determine local install root for GenieX CLI.".to_string()
        })?;
        fs::create_dir_all(&install_root)
            .map_err(|e| format!("Failed to create install directory: {e}"))?;
        let installed_binary = extract_tarball(&download_path, &install_root)?;
        Ok(format!(
            "Downloaded {} and installed GenieX CLI to {}.",
            name,
            installed_binary.display()
        ))
    }
}

/// Information returned by the CLI update check.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    /// Currently installed CLI version (e.g. "0.3.18").
    pub current_version: String,
    /// Latest available version (e.g. "0.3.19").
    pub latest_version: String,
    /// `true` when `latest > current`.
    pub update_available: bool,
    /// URL of the latest GitHub release page.
    pub release_url: String,
}

/// Check whether the `geniex` CLI is installed and reachable on PATH.
///
/// Returns `true` if the binary can be spawned, `false` if not found.
#[tauri::command]
pub async fn check_geniex_installed() -> Result<bool, String> {
    match Command::new(get_geniex_executable())
        .args(["version"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(mut child) => {
            let _ = child.wait().await;
            Ok(true)
        }
        Err(ref e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(format!("Failed to check for geniex CLI: {e}")),
    }
}

/// Return the installed `geniex` CLI version string.
#[tauri::command]
pub async fn get_geniex_version() -> Result<String, String> {
    let output = Command::new(get_geniex_executable())
        .args(["version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run `geniex version`: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("`geniex version` failed: {stderr}"))
    }
}

/// Retrieve a configuration value by key.
#[tauri::command]
pub async fn config_get(key: String) -> Result<Option<String>, String> {
    let output = Command::new(get_geniex_executable())
        .args(["config", "get", &key])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run `geniex config get`: {e}"))?;

    if output.status.success() {
        let val = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(if val.is_empty() { None } else { Some(val) })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("`geniex config get` failed: {stderr}"))
    }
}

/// Set a configuration value. Pass `None` for value to clear it.
#[tauri::command]
pub async fn config_set(key: String, value: Option<String>) -> Result<(), String> {
    let empty = String::new();
    let val = value.as_ref().unwrap_or(&empty);

    let output = Command::new(get_geniex_executable())
        .args(["config", "set", &key, val])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run `geniex config set`: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("`geniex config set` failed: {stderr}"))
    }
}

/// List all configuration keys and their values.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: String,
}

#[tauri::command]
pub async fn config_list() -> Result<Vec<ConfigEntry>, String> {
    let output = Command::new(get_geniex_executable())
        .args(["config", "list"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run `geniex config list`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("`geniex config list` failed: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let entries: Vec<ConfigEntry> = stdout
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }
            // Typical output: "key: value" or "key  value"
            let (key, value) = if let Some(pos) = trimmed.find(':') {
                (
                    trimmed[..pos].trim().to_string(),
                    trimmed[pos + 1..].trim().to_string(),
                )
            } else {
                // Whitespace-separated: "chipset  Qualcomm SM8750"
                let first_ws = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
                (
                    trimmed[..first_ws].to_string(),
                    trimmed[first_ws..].trim().to_string(),
                )
            };
            Some(ConfigEntry { key, value })
        })
        .collect();

    Ok(entries)
}

/// Check whether a newer `geniex` CLI version is available on GitHub.
///
/// Fetches the latest release tag from the GitHub API, compares it with the
/// locally installed version, and returns an [`UpdateInfo`] summary.
/// Returns a graceful "no update" result when the CLI is not installed or the
/// network is unreachable.
#[tauri::command]
pub async fn check_for_cli_update() -> Result<UpdateInfo, String> {
    let current_version = get_installed_version().await;

    let current = match current_version {
        Some(v) => v,
        None => {
            return Ok(UpdateInfo {
                current_version: String::new(),
                latest_version: String::new(),
                update_available: false,
                release_url: "https://github.com/qualcomm/GenieX/releases".to_string(),
            });
        }
    };

    // Fetch the latest release from GitHub.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("LocalGenie")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let resp = client
        .get(GITHUB_LATEST_RELEASE_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest release: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API returned {}", resp.status()));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {e}"))?;

    let tag_name = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    let release_url = json["html_url"]
        .as_str()
        .unwrap_or("https://github.com/qualcomm/GenieX/releases")
        .to_string();

    if tag_name.is_empty() {
        return Err("Could not determine latest version from GitHub".to_string());
    }

    let update_available = version_is_newer(&tag_name, &current);

    Ok(UpdateInfo {
        current_version: current,
        latest_version: tag_name,
        update_available,
        release_url,
    })
}

/// Run `geniex version` and extract only the CLI version number.
///
/// `geniex version` outputs multiple lines:
///   GenieX CLI Version:     v0.3.17
///   QAIRT Runtime Version:  v2.45.0.260326
///   LlamaCPP Runtime Hash:  ae9291e
///
/// This parses just the first line and returns the version after the colon,
/// stripping any leading `v`.
async fn get_installed_version() -> Option<String> {
    let output = Command::new(get_geniex_executable())
        .args(["version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    // First line looks like "GenieX CLI Version:     v0.3.17"
    let first_line = stdout.lines().next()?;
    let raw = first_line
        .split(':')
        .nth(1)?
        .trim()
        .trim_start_matches('v')
        .to_string();

    if raw.is_empty() { None } else { Some(raw) }
}

/// Compare two dotted version strings numerically and return `true` when `a > b`.
///
/// Each segment is parsed as `u64`; non-numeric suffixes are stripped.
fn version_is_newer(a: &str, b: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> {
        v.split('.')
            .map(|s| {
                let digits: String = s.chars().take_while(|c| c.is_ascii_digit()).collect();
                digits.parse().unwrap_or(0)
            })
            .collect()
    };
    parse(a) > parse(b)
}

/// Update the `geniex` CLI to the latest version.
///
/// Reads stdout and stderr **concurrently** to avoid a deadlock when the child
/// process writes progress to stderr while the pipe buffer is full.
///
/// `geniex update` may exit with code 1 even on success (e.g. on Windows where
/// the running binary cannot replace itself). We treat the update as successful
/// when the output contains "ready to install" or "success", regardless of the
/// exit code.
///
/// Emits `geniex-update-progress` events as output is received.
#[tauri::command]
pub async fn update_geniex(app: tauri::AppHandle) -> Result<String, String> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut child = Command::new(get_geniex_executable())
        .args(["update"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn `geniex update`: {e}"))?;

    let mut output = String::new();

    // Read stdout and stderr concurrently to prevent deadlock.
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(stream) = stdout {
            let mut reader = BufReader::new(stream).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                lines.push(line);
            }
        }
        lines
    });

    let stderr_task = tokio::spawn(async move {
        let mut lines = Vec::new();
        if let Some(stream) = stderr {
            let mut reader = BufReader::new(stream).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                lines.push(line);
            }
        }
        lines
    });

    let (stdout_lines, stderr_lines) = tokio::join!(stdout_task, stderr_task);
    let stdout_lines = stdout_lines.map_err(|e| format!("stdout task failed: {e}"))?;
    let stderr_lines = stderr_lines.map_err(|e| format!("stderr task failed: {e}"))?;

    // Emit progress events for both streams and collect full output.
    for line in &stdout_lines {
        output.push_str(line);
        output.push('\n');
        let _ = app.emit(
            "geniex-update-progress",
            serde_json::json!({ "message": line }),
        );
    }
    for line in &stderr_lines {
        output.push_str(line);
        output.push('\n');
        let _ = app.emit(
            "geniex-update-progress",
            serde_json::json!({ "message": line }),
        );
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("`geniex update` error: {e}"))?;

    let output_lower = output.to_lowercase();
    let succeeded = status.success()
        || output_lower.contains("ready to install")
        || output_lower.contains("success");

    if succeeded {
        Ok(output.trim().to_string())
    } else {
        Err(format!("`geniex update` failed: {output}"))
    }
}
