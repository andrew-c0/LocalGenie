use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

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
        let split = if cfg!(windows) { ";" } else { ":" };
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
fn resolve_geniex_executable() -> PathBuf {
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

#[tauri::command]
pub async fn check_for_cli_update() -> Result<crate::commands::cli::UpdateInfo, String> {
    Err("CLI update checks are disabled in this build. Please visit https://github.com/qualcomm/GenieX/releases for updates.".to_string())
}

#[tauri::command]
pub async fn update_geniex(_app: tauri::AppHandle) -> Result<String, String> {
    Err("Automatic update is not supported in this build. Please update GenieX manually from https://github.com/qualcomm/GenieX/releases".to_string())
}

// Minimal UpdateInfo re-export for compatibility with other modules that refer to it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
}
