# Known issues

Status labels: **code-verified** = read in the working tree (uncommitted, 2026-10-22); **runtime-unverified** = not run. Nothing was launched in this sync.

## Active
- Model load/chat hangs: the GenieX warmup request in `load_model` may never get a response. Not re-validated in the working tree (runtime-unverified).
- Normal chat depends on a successful model load.
- `chat-chunk`/`chat-done` carry no session or stream id; tokens go to the session active at that moment, so switching chats mid-stream moves the reply (code-verified in `AppBootstrap.tsx`).
- Failed sends are added to the chat as an assistant message but not saved to the DB, so they vanish on reload while staying in the context for the next turn (per `docs/code-scan-2026-10-22.md` 1.10; not re-read in this sync).
- Settings `nctx` and `think` do nothing: `ModelSettings` writes them, but `startServer` is only called with `port`/`compute` and `build_chat_body` does not read either (code-verified).
- Webview `fetch` to `huggingface.co` (`hubApi.ts`, `AppBootstrap.tsx` context-size lookup) is not allowed by the CSP `connect-src` as configured (code-verified against `tauri.conf.json`). Runtime-unverified; the Hub browser may fail. Moving these to Rust is the candidate fix.
- `HubModelDetail` loads downloaded precisions once per repo, so "Load & Chat" may not appear until the page is reopened after an import (per `docs/fix-plan.md`; runtime-unverified).
- Typed event payloads and typed errors are not in place; UI matches on error text.

## UI follow-ups
- Benchmark "Run Benchmark" only toggles visual state; no backend benchmark command. Dashboard "Export" and Playground "Save Preset" are disabled.
- Benchmark run history is in-memory only (`benchmarkStore`).
- Hardware telemetry (NPU/VRAM, thermals, bandwidth, power) has no backend source; pages show "unavailable".
- Per-response stats line (TTFT, tok/s) is not persisted; `messages` has no stats columns.
- Syntax highlighting: `rehype-highlight` runs only with `allowHtml`, and no highlight.js theme is imported.
- Page padding choice is undecided (`docs/fluent-ui-migration.md`).
- The UI has not been run since the Fluent migration (runtime-unverified).

## Operational notes
- No per-model unload endpoint in the GenieX CLI; stopping the server is the only unload.
- The port is configurable and persisted in `user_preferences` (default `18181`).
- The running server PID is cleared when the `geniex serve` child exits, so a crashed server can be started again (code-verified in `server.rs`; runtime-unverified).

## Resolved (code-verified in the working tree, uncommitted; runtime-unverified)
- Download cancel, resume and duplicate guard are keyed by repo id (`download.rs` `cancel_download`/`register`; `downloadStore.startGGUFDownload`). Partial files are `.part` and renamed on success, so a truncated file is no longer taken as complete.
- README fetch failure no longer fails an import (`import.rs`, `match` instead of `?`).
- Context-size fallback uses `context_length ?? max_position_embeddings ?? max_sequence_length` (`AppBootstrap.tsx`).
- Session persistence saves every changed session (dirty set, `AppBootstrap.tsx`).
- `useTauriEvent` subscribes once per event name (`hooks/index.ts`).
- The `install_geniex` stub is removed; the banner opens the releases page (`Layouts.tsx`).
- Header model selector is wired to `ModelSelectorPopover` (`Header.tsx`).
- Earlier, from git history: session persistence upsert fix, installer-based CLI update flow and update UI rework (see `cli-update.md`).
