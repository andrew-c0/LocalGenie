pub mod aihub;
pub mod attachments;
pub mod benchmark_files;
pub mod benchmark_prompts;
pub mod benchmark_runner;
pub mod benchmark_runs;
pub mod benchmark_suites;
pub mod capabilities;
pub mod capability_scan;
pub mod chat;
pub mod chat_helpers;
pub mod cli;
pub mod cli_update;
pub mod constants;
pub mod database;
pub mod download;
pub mod files;
pub mod hub;
pub mod import;
pub mod logs;
pub mod model_ram;
pub mod models;
pub mod playground;
pub mod power;
pub mod runtimes;
pub mod server;
pub mod system;
pub mod system_usage;

use std::collections::HashMap;
use std::sync::Mutex;

/// Shared application state managed by Tauri.
pub struct AppState {
    /// The `geniex serve` child processes the app started, keyed by port, with their compute.
    /// An entry is removed by the server's exit watcher or by a stop request.
    pub server_processes: Mutex<server::ServerMap>,
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
            server_processes: Mutex::new(HashMap::new()),
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
