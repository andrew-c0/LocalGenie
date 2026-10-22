---
name: rust-quality
description: 'Rust & Tauri code quality workflow for LocalGenie backend. Use when: reviewing, refactoring, or writing Tauri commands, sea-orm entities/migrations, download logic; fixing clippy/cargo warnings; ensuring serializable IPC contracts before finishing backend work.'
---

# Rust Code Quality

## When to Use
- Before declaring any `src-tauri/` change done
- Reviewing or refactoring Tauri commands, entities, migrations, or services
- Fixing compiler/clippy warnings in the backend

## Procedure

1. **Compile check**: run `cargo check` from `src-tauri/`. Fix all errors and warnings.
2. **Clippy**: run `cargo clippy` — address lints rather than suppressing them; if a `#[allow]` is truly needed, justify it in a comment.
3. **Tauri command patterns**:
   - Commands return `Result<T, E>` where `E` is a serializable error (e.g., `String` or a dedicated error enum with `#[serde]`).
   - Shared state via `tauri::State<AppState>`; avoid `Mutex` where atomics/channels suffice; never hold a lock across `.await` unless necessary.
   - Long-running work (downloads, streaming) should report progress via Tauri events, not block the caller.
   - **Commands with many optional args take a single options struct** (serde camelCase, e.g. `ServerStartOptions`) instead of 5+ flat parameters — clippy's `too_many_arguments` limit is 7.
4. **Reuse & deduplication** (check before writing anything new):
   - **CLI invocation**: `models.rs` has `run_geniex(args, what)` for run-to-completion commands; `cli.rs` has `resolve_geniex_executable()` and `get_installed_version_timeout()`. Reuse them; don't re-inline spawn + status-check + stderr formatting.
   - **Process kill**: `server.rs` has `kill_process` (async) and `kill_process_sync` (window-destroy handlers) — never inline platform-specific `taskkill`/`kill` blocks.
   - **Server models fetch**: `server.rs` `fetch_loaded_models()` parses `/v1/models` into model ids — reuse instead of duplicating the fetch/parse.
   - **HTTP clients**: `cli.rs` `github_client(timeout_secs)` builds the standard GitHub client; `AppState.http_client` is the shared client for the GenieX server. Don't create ad-hoc clients for those.
5. **Database patterns** (sea-orm):
   - New tables: entity in `entities/`, migration in `migrations/` registered in `migrations/mod.rs`, never edit old migrations.
   - Use `ActiveModel` setters; handle `DbErr` explicitly.
6. **Async**: tokio; use `reqwest` streaming for downloads; `futures-util` for stream combinators.
7. **Verify**: re-run `cargo check` and `cargo clippy` — zero new warnings.

## Anti-patterns
- `unwrap()`/`expect()` in command handlers — propagate errors instead
- Blocking calls (`std::fs` heavy IO) inside async commands — use `tokio::fs` or `spawn_blocking`
- Breaking `#[tauri::command]` signatures without flagging the frontend IPC change
- Editing already-applied migrations
- Duplicated CLI spawn/kill/HTTP-client logic instead of the shared helpers
- 5+ flat optional args on a command instead of an options struct
