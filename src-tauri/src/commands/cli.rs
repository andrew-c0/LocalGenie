use std::process::Stdio;
use tauri::Emitter;
use tokio::process::Command;

/// GitHub API URL for the latest GenieX release.
const GITHUB_LATEST_RELEASE_URL: &str =
    "https://api.github.com/repos/qualcomm/GenieX/releases/latest";

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
    match Command::new("geniex")
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
    let output = Command::new("geniex")
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
    let output = Command::new("geniex")
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

    let output = Command::new("geniex")
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
    let output = Command::new("geniex")
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
    let output = Command::new("geniex")
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

    let mut child = Command::new("geniex")
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
