use std::process::Stdio;
use tauri::Emitter;
use tokio::process::Command;

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

/// Update the `geniex` CLI to the latest version.
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

    if let Some(stdout) = child.stdout.take() {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            output.push_str(&line);
            output.push('\n');
            let _ = app.emit(
                "geniex-update-progress",
                serde_json::json!({ "message": line }),
            );
        }
    }

    // Drain stderr too
    if let Some(stderr) = child.stderr.take() {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            output.push_str(&line);
            output.push('\n');
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("`geniex update` error: {e}"))?;

    if status.success() {
        Ok(output.trim().to_string())
    } else {
        Err(format!("`geniex update` failed: {output}"))
    }
}
