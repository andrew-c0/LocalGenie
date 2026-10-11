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
