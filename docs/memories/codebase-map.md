# Codebase map

Snapshot: base commit `84170dd` (2026-10-20) plus a large **uncommitted** working tree (2026-10-22). Treat the working tree as current; nothing from it is committed. The `src-tauri/` backend was still being split into modules when this was written (`commands/import.rs`, `cli_update.rs`, `hub.rs` are new and untracked). At this sync `tsc --noEmit` and Biome passed on `src/`; `cargo check` was not run and nothing was launched.

Maintained by the `knowledge-sync` agent. Facts only; rules live in `.github/github-instructions.md`, history in git.

## Product
- LocalGenie = Tauri 2 desktop UI over Qualcomm's GenieX CLI (`geniex`), which runs local LLMs on CPU/GPU/NPU. Primary target: Windows ARM64.
- Model path for Hugging Face GGUF: the app downloads the file itself (`download_file`, resumable via `<file>.part` + HTTP Range), then imports it with `geniex pull <repo>:<precision> --model-hub localfs --local-path <dir>` (`import_gguf`). Hub pulls are no longer used by the app.
- Qualcomm AI Hub code is legacy-in-progress, not to be expanded: `list_aihub_models`, `AihubModel`, `ModelInfo.source = "aihub"`, the "qualcomm" browse area (HF `author=qualcomm` intersected with `geniex model list`, `compatibleNames`). The compat badge input `assetCompat` is never populated (no caller of `setAssetCompat`).
- No tests yet (vitest installed, no test files). README is a stub. Backlog: `tasks.md` (user-owned).

## Stack
React 19 + TS 5.8 + Vite 6, Fluent UI v9 (`@fluentui/react-components`), zustand 5, react-router-dom 7 (MemoryRouter), react-markdown + rehype-highlight. Biome for lint/format. Rust: tauri 2, tauri-plugin-shell (used only for `open` of URLs), sea-orm 1 (SQLite), tokio, reqwest, sysinfo. Dev port 1420; GenieX server default port 18181.
CSP (`src-tauri/tauri.conf.json`): `connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*` only. Webview `fetch` to huggingface.co is therefore not allowed as configured (see known-issues). Rust-side `reqwest` calls are not subject to CSP.

## Frontend (`src/`)
- `main.tsx`: `FluentProvider theme={webDarkTheme}` wraps `ErrorBoundary` (fallback `ErrorFallback.tsx`). `App.tsx` is scaffolding: MemoryRouter -> `AppBootstrap` -> `Navigation` + Toaster. `App.css` and `theme.ts` are gone.
- `components/AppBootstrap.tsx`: startup load (CLI check, sessions, models, server status/port, CLI update check), global Tauri listeners, debounced persistence of changed sessions.
- `Navigation.tsx`: all routes. `/` Overview, `/models` LocalModelsBrowserPage, `/models/:repoId` HubModelDetail (via `HubModelDetailRoute`), `/chat`, `/prompt-benchmark` (index -> `playground`, `dashboard`), `/settings`; `/benchmark` redirects; `*` -> `/`. All under `MainLayout`.
- `components/shell/`: `Layouts.tsx` (MainLayout, `CliMissingBanner` links to the GenieX releases page), `Sidebar`, `Header` (renders `ModelSelectorPopover`), `ModelSelectorPopover`, `ModelOptionButton`, `DownloadDrawer`, `DownloadItemCard`, `DownloadStatusBadge`.
- `components/ui/`: `primitives.tsx`, `ChipRow`, `ConfirmDialog`, `ErrorBanner`, `PageHeader`, `ModelCard`, `MarkdownContent`. Other: `components/models/HubModelBrowser.tsx`, `components/chat/*`, `components/benchmark/*`, `components/AppSettings.tsx`, `ModelSettings.tsx`.
- `pages/models/`: `HubModelDetail.tsx`, `useHubModelDetail.ts` (data hooks). GGUF grouping is in `services/hubModels.ts`. `docs/fluent-ui-migration.md` places `ggufGroups.ts` under `pages/models/`; that file does not exist.
- Stores (`stores/`): `chatStore`, `modelStore`, `hubBrowseStore` (HF browse state and cache), `downloadStore` (download entries + `startGGUFDownload(variant)`), `benchmarkStore` (in-memory).
- Services (`services/`, the only `invoke()` callers; verified by grep): `geniex.ts` (CLI, server, chat, update), `database.ts`, `download.ts` (`downloadFile`, `cancelDownload`, `importGGUF`, `deleteDirectory`), `system.ts`, `hubApi.ts` (HF REST via `fetch`: models, model info, file tree, README; `AssetCompat` type only), `hubModels.ts` (GGUF file listing and grouping).
- `utils/gguf.ts` parses GGUF filenames (spec in `memories/external/gguf/gguf.md`). `utils/format.ts`, `utils/toast.tsx`. `hooks/index.ts`: `useTauriEvent` (one listener per event name, handler in a ref), `useDebouncedCallback`, `useAppToast`.

## Backend (`src-tauri/src/`)
- `lib.rs`: opens `geniex.db` in the app data dir, runs migrations, manages `AppState` and `DownloadRegistry`, registers commands, kills the server PID on window destroy.
- `commands/` (one domain per module): `models` (list, list_aihub, remove, clean, set_type), `hub` (search_models), `server` (start/stop/status, PID tracking), `chat` + `chat_helpers` (load_model, unload_all_models, chat_completion, cancel), `cli` (check installed, config get/set/list, `resolve_geniex_executable`), `cli_update` (check_for_cli_update, update_geniex), `download` (download_file, cancel_download), `import` (import_gguf, delete_directory), `database`, `system` (memory), `constants`.
- Entities: `chat_sessions`, `messages`, `model_settings`, `user_preferences`, `downloaded_models` (name PK; precision, context_size, param_count, repo_url, model_card, timestamps). Migrations: `m20260730_000001_create_tables`, `m20261007_000001_downloaded_models`, `m20261020_000001_add_repo_columns`. No migration added in the working tree.

## Events (verified by grep)
- `download-progress` `{ id, file, received, total, speed }`, `{ ..., complete: true }`, `{ id, file, cancelled: true }`. `id` = Hugging Face repo id (download id). Replaces `asset-download-progress` (removed).
- `model-pull-start | model-pull-progress | model-pull-complete` `{ model }`: emitted only by `import_gguf` (GenieX local import). Hub pull events are gone.
- `chat-chunk` `{ content }`, `chat-done` (no payload; per-response stats are computed in the frontend), `server-stopped` (no payload), `server-log` `{ stream, message }` (emitted; no listener in `src/`), `geniex-update-progress` `{ message }`.

## IPC contract changes in the working tree (uncommitted)
- `download_file(download_id, url, file_name)`: new `download_id` first arg; `precision` arg removed.
- `cancel_download(download_id)`: matches the drawer entry id.
- Removed commands: `pull_model`, `install_geniex`, `get_geniex_version`. Frontend wrappers removed as well.
- `import_gguf(local_path, repo_id, filename, precision)` returns the import folder; `delete_directory(path)` is limited to paths inside the Downloads folder.
- Command names of `check_for_cli_update`, `update_geniex`, `search_models`, `delete_directory`, `import_gguf` are unchanged (only their Rust module moved).

## Key flows
- GGUF download (`downloadStore.startGGUFDownload`, entry keyed by repo id): `download_file` (`.part`, Range resume, refuses a second download of the same id, cancel via `cancel_download`) -> `import_gguf` (move into `<Downloads>/<base-model>/`, `geniex pull ... --model-hub localfs`, README fetch best-effort, `upsert_downloaded_model`) -> `delete_directory(<folder>)` -> sidecar files downloaded best-effort. Status: `downloading` -> `importing` (`model-pull-start`) -> `finished` (`model-pull-complete`, which refreshes the model list); `cancelled` or `error` otherwise. Resume = start again; the `.part` file is reused.
- Chat: `start_server` (spawns `geniex serve`; PID cleared when the child exits) -> `load_model` (1-token warmup request; checks the model is listed) -> `chat_completion` streams `chat-chunk` -> `chat-done`. Sessions saved debounced via `database.ts`, only those that changed.
- CLI update: installer-based, see `cli-update.md`.

## Docs/agents landscape
- `.github/github-instructions.md` (rules + routing), `.github/agents/*`, `.github/skills/*`, `.github/geniex-cli-reference.md` (user-owned; not edited here).
- `memories/repo/*` project notes; `memories/external/*` HF Hub OpenAPI + GGUF spec (large, read on demand).
- `docs/` (uncommitted): `code-scan-2026-10-22.md` (findings), `fix-plan.md` (phases; status section), `fluent-ui-migration.md` (open items).
- `.claude/agents/knowledge-sync.md` keeps these files current; cursor in `.claude/knowledge-sync.state`.

## Known doc drift (not fixed here)
- `.github/geniex-cli-reference.md` and `.github/agents/geniex-specialist-agent.md` describe `geniex pull` as the model lifecycle. That is accurate for the CLI but the app no longer uses hub pulls. User-owned; report only.
- `src/stores/hubBrowseStore.ts` comments (around lines 41-42 and 205) still mention `release_assets.json` and release-asset zips, which were removed. Code comment in `src/` (not editable in this sync).
- `docs/fluent-ui-migration.md` open item 8 and `docs/fix-plan.md` "Known follow-ups" are dated handoff notes; they are not maintained by this sync.
- Mid-refactor: `commands/mod.rs` declares `hub`, `import`, `cli_update`; the new files are untracked. Verify `cargo check` before trusting the backend layout.
