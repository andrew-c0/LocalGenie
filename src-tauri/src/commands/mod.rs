pub mod chat;
pub mod chat_helpers;
pub mod cli;
pub mod constants;
pub mod database;
pub mod models;
pub mod server;

use std::sync::Mutex;

/// Shared application state managed by Tauri.
pub struct AppState {
    /// Handle to the running `geniex serve` child process.
    pub server_process: Mutex<Option<u32>>,
    /// Shared HTTP client for talking to the GenieX server.
    /// `reqwest::Client` manages a connection pool internally — reusing it
    /// avoids allocating a new pool and TCP connections per request.
    pub http_client: reqwest::Client,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            server_process: Mutex::new(None),
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(constants::HTTP_TIMEOUT_SECS))
                .build()
                .expect("Failed to create HTTP client"),
        }
    }
}
