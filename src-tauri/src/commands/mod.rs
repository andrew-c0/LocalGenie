pub mod chat;
pub mod capability_scan;
pub mod chat_helpers;
pub mod cli;
pub mod capabilities;
pub mod cli_update;
pub mod constants;
pub mod database;
pub mod download;
pub mod files;
pub mod hub;
pub mod import;
pub mod logs;
pub mod models;
pub mod server;
pub mod system;
pub mod system_usage;

use std::sync::Mutex;

/// Shared application state managed by Tauri.
pub struct AppState {
    /// Handle to the running `geniex serve` child process.
    pub server_process: Mutex<Option<u32>>,
    /// Shared HTTP client for talking to the GenieX server.
    /// `reqwest::Client` manages a connection pool internally — reusing it
    /// avoids allocating a new pool and TCP connections per request.
    pub http_client: reqwest::Client,
    /// Recent `geniex serve` output for the Logs page.
    pub server_logs: Mutex<logs::LogBuffer>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            server_process: Mutex::new(None),
            server_logs: Mutex::new(logs::LogBuffer::default()),
            // No total timeout here: chat streams run until the model finishes.
            // Non-streaming calls set `HTTP_TIMEOUT_SECS` per request.
            http_client: reqwest::Client::builder()
                .connect_timeout(std::time::Duration::from_secs(
                    constants::HTTP_CONNECT_TIMEOUT_SECS,
                ))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        }
    }
}
