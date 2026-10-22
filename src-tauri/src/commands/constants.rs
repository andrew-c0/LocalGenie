/// Default port for the GenieX serve process.
pub const DEFAULT_PORT: u16 = 18181;

/// Default base URL for the GenieX server (used when no URL is provided).
pub const DEFAULT_BASE_URL: &str = "http://127.0.0.1:18181";

/// Connect timeout for the shared HTTP client, in seconds. No total timeout is set
/// on the client, so long chat streams are not cut off.
pub const HTTP_CONNECT_TIMEOUT_SECS: u64 = 10;

/// Timeout for non-streaming HTTP calls (model list, warmup, probes, Hugging Face
/// lookups), applied per request, in seconds. Also bounds how long a chat request
/// may take to return response headers.
pub const HTTP_TIMEOUT_SECS: u64 = 300;

/// Number of readiness probe retries when starting the server.
pub const SERVER_STARTUP_PROBES: u32 = 15;

/// Delay between readiness probes during server startup (ms).
pub const SERVER_STARTUP_PROBE_DELAY_MS: u64 = 500;

/// Timeout for quick `geniex` probes (version, config get/list), in seconds.
pub const CLI_PROBE_TIMEOUT_SECS: u64 = 5;

/// Timeout for `geniex config set`, in seconds.
pub const CLI_CONFIG_SET_TIMEOUT_SECS: u64 = 10;

/// Timeout for GitHub API calls, in seconds.
pub const GITHUB_TIMEOUT_SECS: u64 = 10;

/// Timeout for downloading the CLI installer, in seconds.
pub const INSTALLER_DOWNLOAD_TIMEOUT_SECS: u64 = 300;

/// Seconds between version checks while waiting for the installer to finish.
pub const UPDATE_POLL_INTERVAL_SECS: u64 = 3;

/// Version checks before the update is reported as not completed (5 minutes at 3 s).
pub const UPDATE_POLL_ATTEMPTS: u32 = 100;

/// Upper bound for a `geniex` CLI call (list, remove, clean, model set-type), in seconds.
pub const GENIEX_COMMAND_TIMEOUT_SECS: u64 = 180;
