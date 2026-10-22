use serde::Serialize;

/// Host memory figures used by the UI to estimate whether a model
/// precision fits in System RAM.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMemoryInfo {
    /// Total physical memory in bytes.
    pub total_bytes: u64,
    /// Currently available (free + reclaimable) memory in bytes.
    pub available_bytes: u64,
}

/// Report total and available System RAM for the precision fit calculator.
#[tauri::command]
pub async fn get_system_memory() -> Result<SystemMemoryInfo, String> {
    // sysinfo reads /proc or calls GlobalMemoryStatusEx — quick, but keep it
    // off the async runtime thread anyway.
    tokio::task::spawn_blocking(|| {
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        Ok(SystemMemoryInfo {
            total_bytes: sys.total_memory(),
            available_bytes: sys.available_memory(),
        })
    })
    .await
    .map_err(|e| format!("system memory probe failed: {e}"))?
}

/// Host details shown in the system prompt's platform block.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    /// OS family name, for example "Windows" or "Ubuntu".
    pub os: String,
    /// Long OS version string, empty when the OS does not report one.
    pub os_version: String,
    /// CPU architecture, for example "x86_64" or "aarch64".
    pub arch: String,
    /// Total physical memory in bytes.
    pub total_memory_bytes: u64,
}

/// Report OS, architecture and total RAM for the system prompt's platform block.
#[tauri::command]
pub async fn get_platform_info() -> Result<PlatformInfo, String> {
    tokio::task::spawn_blocking(|| {
        let mut sys = sysinfo::System::new();
        sys.refresh_memory();
        Ok(PlatformInfo {
            os: sysinfo::System::name().unwrap_or_else(|| std::env::consts::OS.to_string()),
            os_version: sysinfo::System::long_os_version().unwrap_or_default(),
            arch: std::env::consts::ARCH.to_string(),
            total_memory_bytes: sys.total_memory(),
        })
    })
    .await
    .map_err(|e| format!("platform probe failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn platform_info_reports_os_and_arch() {
        let info = get_platform_info().await.expect("platform info");
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
        assert!(info.total_memory_bytes > 0);
    }
}
