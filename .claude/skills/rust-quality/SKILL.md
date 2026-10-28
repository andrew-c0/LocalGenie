---
name: rust-quality
description: Rust and Tauri quality workflow for LocalGenie's backend. Use when writing, reviewing or refactoring anything under src-tauri/ (commands, sea-orm entities and migrations, downloads, CLI and server process handling), or before declaring such a change done. Covers SOLID, readable naming and Rust idioms.
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
   - `download::validate_file_name` for any file name the webview sends. Keep every path inside the Downloads folder.
5. Check the command contract: `Result<T, String>`, `tauri::State` for shared state, and an options struct once a command has more than about five optional arguments. Report every signature change with its frontend callers in `src/services/`.
6. Run the review checklist below on every changed function and module.

## Review checklist

### SOLID and structure
- **Single responsibility:** a command validates input, calls a domain helper and returns. Parsing, HTTP, filesystem and process work live in separate functions, ideally in separate modules. A function that does two of these is a split candidate.
- **Open/closed:** a new variant (model source, precision, runtime) is a new enum arm or a new function, not another `if` branch in a shared function.
- **Liskov:** a trait implementation keeps the contract of the trait, including its error cases. No `unimplemented!()` in a trait method that callers can reach.
- **Interface segregation:** a trait or struct a caller only reads from should not force it to know about writers. Prefer small traits and narrow argument types (`&Path`, `&str`) over owning the whole `AppState`.
- **Dependency inversion:** domain helpers take what they need as arguments (`&reqwest::Client`, `&Path`). They do not reach into `State<'_, AppState>` or global statics, which keeps them testable.
- **One domain per module:** download and import, CLI and update stay apart. Do not add a second domain to a module because it is nearby.

### Readable names
- Functions are verbs that say what they do: `validate_file_name`, `resolve_geniex_executable`, `remove_variant_files`. Avoid `process`, `handle`, `do_it`, `run2`, `helper`, `misc`, `utils`, `manager`, `data`, `info`, `tmp`, `res`, `val`.
- A name says the domain it belongs to: `import_aihub_zip`, not `import_zip`, when the function only handles one source.
- Booleans read as a question or a state: `is_allowed`, `has_projector`, `dir_exists`. Not `flag`, `check`, `ok` on a struct field.
- Avoid one-letter names outside short closures and loop indices. Common short forms are fine (`id`, `url`, `dir`, `err` in a `map_err` closure, `idx` for an index).
- If a name needs a comment to be understood, rename it first.
- Types are nouns (`ModelVariant`, `DownloadRegistry`). Enum variants name the case (`Source::AiHub`, not `Source::Type2`).

### Rust idioms that make code easier to read
- Use `?` and `map_err` instead of nested `match` on `Result` or `Option` when the error path only forwards.
- Prefer `if let` / `let else` over a `match` with an empty `_ => {}` arm.
- Prefer an enum over two booleans or a string that encodes a state (`Source::AiHub` over `source: &str` with a magic value).
- Prefer returning early over deep nesting; a function body stays under about 50 lines unless it is a linear sequence of steps.
- Do not `clone()` only to satisfy the borrow checker. Restructure the borrow, or take a reference.
- Avoid `pub` unless another module uses it. Keep `pub(crate)` for crate-internal items.
- Public items in a domain module have a `///` line that says what they do or why, not what their name already says.
- Constants and string keys (`SOURCE_AIHUB`, `AIHUB_DOWNLOAD_PREFIX`) live in one place. Do not repeat literal strings across modules.
- No `unwrap()`, `expect()` or `panic!` in a command or a helper it calls. Errors become `String` via `map_err`, with a message a user can act on.
- Avoid `as` casts between numeric types when `try_from` or `into` works, because `as` truncates silently.

## Anti-patterns
- `unwrap()` or `expect()` in a command or a helper it calls. Use `map_err`.
- Blocking `std::fs` work inside an async command that runs for long. Use `tokio::fs` or `spawn_blocking`.
- Holding a `std::sync::Mutex` across an `.await`.
- Editing an applied migration. Add a new one.
- Putting two domains in one module (download and import, CLI and update).
- Copying spawn, kill or HTTP-client code that already exists in a helper.
- A function that both parses input and performs side effects, or a command body longer than its helpers.
- Boolean parameters that change behaviour (`fn pull(force: bool, quiet: bool, …)`). Use an enum or an options struct.
- Generic names from the list above, or abbreviations a new reader would have to look up.
- Changing a command's arguments or return type without naming the frontend change.
