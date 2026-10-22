---
name: rust-quality
description: Rust and Tauri quality workflow for LocalGenie's backend. Use when writing, reviewing or refactoring anything under src-tauri/ (commands, sea-orm entities and migrations, downloads, CLI and server process handling), or before declaring such a change done.
---

# Rust quality (LocalGenie backend)

## Procedure
1. Compile and lint from `src-tauri/`: `cargo clippy --all-targets`. Fix warnings. Suppress a lint only with an `#[allow]` and a comment that says why.
2. Test: `cargo test`. Add a unit test for any new pure helper (path checks, parsers, version comparison).
3. Format the files you changed: `cargo fmt`.
4. Check the shared helpers before writing new code:
   - `models::run_geniex` for CLI runs to completion (timeout included).
   - `cli::resolve_geniex_executable`, `cli::get_installed_version_timeout` for the binary and its version.
   - `server::kill_process` and `server::kill_process_sync` for killing the server. No inline `taskkill` or `kill`.
   - `server::fetch_loaded_models` for `/v1/models`.
   - `AppState.http_client` for the GenieX server. `DownloadRegistry` owns the download client.
   - `download::validate_file_name` and `download::ensure_inside_downloads` for any path or name the webview sends.
5. Check the command contract: `Result<T, String>`, `tauri::State` for shared state, and an options struct once a command has more than about five optional arguments. Report every signature change with its frontend callers in `src/services/`.

## Anti-patterns
- `unwrap()` or `expect()` in a command or a helper it calls. Use `map_err`.
- Blocking `std::fs` work inside an async command that runs for long. Use `tokio::fs` or `spawn_blocking`.
- Holding a `std::sync::Mutex` across an `.await`.
- Editing an applied migration. Add a new one.
- Putting two domains in one module (download and import, CLI and update).
- Copying spawn, kill or HTTP-client code that already exists in a helper.
- Changing a command's arguments or return type without naming the frontend change.
