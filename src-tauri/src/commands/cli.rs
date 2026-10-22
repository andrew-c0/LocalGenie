use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

use super::constants::{CLI_CONFIG_SET_TIMEOUT_SECS, CLI_PROBE_TIMEOUT_SECS};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConfigEntry {
    pub key: String,
    pub value: String,
}

// GenieX is supported only on Windows on ARM64 for this project.
fn platform_supported() -> bool {
    cfg!(all(target_os = "windows", target_arch = "aarch64"))
}

/// Standard error for unsupported platforms.
fn platform_unsupported_err() -> String {
    "GenieX CLI is only supported on Windows on ARM64 (aarch64).".to_string()
}

fn find_local_geniex_binary() -> Option<PathBuf> {
    if cfg!(target_os = "windows") {
        if let Some(appdata) = env::var_os("APPDATA") {
            let root = PathBuf::from(appdata).join("geniex-cli");
            if root.exists() {
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
                // Shallow scan of the install root only; no recursive walk.
                if let Ok(entries) = fs::read_dir(&root) {
                    for e in entries.flatten() {
                        let p = e.path();
                        let is_geniex = p
                            .file_name()
                            .and_then(|n| n.to_str())
                            .is_some_and(|s| s.eq_ignore_ascii_case("geniex.exe"));
                        if p.is_file() && is_geniex {
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
            let candidate = if cfg!(windows) {
                p.join("geniex.exe")
            } else {
                p.join("geniex")
            };
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Determine an executable path to try. Prefer local install root, then PATH,
/// then a default name which will likely fail fast.
pub(super) fn resolve_geniex_executable() -> PathBuf {
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
pub(super) async fn get_installed_version_timeout(secs: u64) -> Option<String> {
    let exe = resolve_geniex_executable();
    let mut cmd = Command::new(&exe);
    cmd.args(["version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    match timeout(Duration::from_secs(secs), cmd.output()).await {
        Ok(Ok(output)) => {
            if !output.status.success() {
                return None;
            }
            let stdout = String::from_utf8_lossy(&output.stdout);
            let first_line = stdout.lines().next().unwrap_or("").trim();
            // Tokens like "v0.3.17" or "0.3.17" are expected; take the first numeric dotted one.
            first_line.split_whitespace().find_map(|tok| {
                let t = tok.trim_start_matches('v');
                let looks_like_version = t.contains('.')
                    && t.chars().any(|c| c.is_ascii_digit())
                    && t.chars().all(|c| c.is_ascii_digit() || c == '.');
                looks_like_version.then(|| t.to_string())
            })
        }
        _ => None,
    }
}

/// Run a `geniex config` style command with a timeout and return its stdout.
async fn run_config(args: &[&str], secs: u64, what: &str) -> Result<String, String> {
    let exe = resolve_geniex_executable();
    let output = timeout(
        Duration::from_secs(secs),
        Command::new(exe).args(args).output(),
    )
    .await;
    match output {
        Ok(Ok(out)) if out.status.success() => {
            Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
        }
        Ok(Ok(out)) => Err(format!(
            "`{what}` failed: {}",
            String::from_utf8_lossy(&out.stderr)
        )),
        Ok(Err(e)) => Err(format!("Failed to run `{what}`: {e}")),
        Err(_) => Err(format!("`{what}` timed out")),
    }
}

#[tauri::command]
pub async fn check_geniex_installed() -> Result<bool, String> {
    if !platform_supported() {
        return Ok(false);
    }
    Ok(get_installed_version_timeout(CLI_PROBE_TIMEOUT_SECS)
        .await
        .is_some())
}

#[tauri::command]
pub async fn config_get(key: String) -> Result<Option<String>, String> {
    if !platform_supported() {
        return Err(platform_unsupported_err());
    }
    let val = run_config(
        &["config", "get", &key],
        CLI_PROBE_TIMEOUT_SECS,
        "geniex config get",
    )
    .await?;
    Ok(if val.is_empty() { None } else { Some(val) })
}

#[tauri::command]
pub async fn config_set(key: String, value: Option<String>) -> Result<(), String> {
    if !platform_supported() {
        return Err(platform_unsupported_err());
    }
    let val = value.unwrap_or_default();
    run_config(
        &["config", "set", &key, &val],
        CLI_CONFIG_SET_TIMEOUT_SECS,
        "geniex config set",
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub async fn config_list() -> Result<Vec<ConfigEntry>, String> {
    if !platform_supported() {
        return Err(platform_unsupported_err());
    }
    let stdout = run_config(
        &["config", "list"],
        CLI_PROBE_TIMEOUT_SECS,
        "geniex config list",
    )
    .await?;
    Ok(stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let trimmed = line.trim();
            let (key, value) = match trimmed.find(':') {
                Some(pos) => (trimmed[..pos].trim(), trimmed[pos + 1..].trim()),
                None => {
                    let first_ws = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
                    (&trimmed[..first_ws], trimmed[first_ws..].trim())
                }
            };
            ConfigEntry {
                key: key.to_string(),
                value: value.to_string(),
            }
        })
        .collect())
}

/// Runtime versions reported by `geniex version`. Each is None when the CLI does not report it.
#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeVersions {
    pub llama_cpp: Option<String>,
    pub qairt: Option<String>,
}

/// Parse `geniex version` output such as `LlamaCPP Runtime Hash:  e467e5b`.
fn parse_runtime_versions(stdout: &str) -> RuntimeVersions {
    let mut versions = RuntimeVersions::default();
    for line in stdout.lines() {
        let Some((label, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        match label.trim() {
            "LlamaCPP Runtime Hash" => versions.llama_cpp = Some(value.to_string()),
            "QAIRT Runtime Version" => versions.qairt = Some(value.to_string()),
            _ => {}
        }
    }
    versions
}

/// Read the llama.cpp and QAIRT runtime versions from `geniex version`.
#[tauri::command]
pub async fn get_runtime_versions() -> Result<RuntimeVersions, String> {
    if !platform_supported() {
        return Err(platform_unsupported_err());
    }
    let output = timeout(
        Duration::from_secs(CLI_PROBE_TIMEOUT_SECS),
        Command::new(resolve_geniex_executable())
            .args(["version"])
            .output(),
    )
    .await
    .map_err(|_| "geniex version timed out".to_string())?
    .map_err(|e| format!("Failed to run geniex version: {e}"))?;
    if !output.status.success() {
        return Err("geniex version failed".to_string());
    }
    Ok(parse_runtime_versions(&String::from_utf8_lossy(
        &output.stdout,
    )))
}

#[cfg(test)]
mod runtime_version_tests {
    use super::parse_runtime_versions;

    #[test]
    fn parses_llama_cpp_hash_and_qairt_version() {
        let out = "GenieX CLI Version:     v0.9.3\nQAIRT Runtime Version:  2.50\nLlamaCPP Runtime Hash:  e467e5b\n";
        let v = parse_runtime_versions(out);
        assert_eq!(v.llama_cpp.as_deref(), Some("e467e5b"));
        assert_eq!(v.qairt.as_deref(), Some("2.50"));
    }

    #[test]
    fn missing_lines_leave_versions_unset() {
        let v = parse_runtime_versions("GenieX CLI Version:     v0.9.3\n");
        assert!(v.llama_cpp.is_none());
        assert!(v.qairt.is_none());
    }
}
