# Codebase map

Snapshot: HEAD `3cbc3f9` (2026-10-22), which includes the folder regrouping of `src/` and the `.claude/` agent move. Plus **uncommitted** work: the model-settings change (`src-tauri/src/commands/chat.rs`, `chat_helpers.rs`; `src/components/ModelSettings/`, `ChatInput`, `shell/Header/useModelLoader.ts`, `services/geniex.ts`, `stores/modelStore.ts`, `types/index.ts`, new `utils/modelSettings.ts` and its test). The working tree (`git status`) is the source of truth for these. Not run in this sync: `cargo check`, `cargo test`, the app.

Maintained by the `knowledge-sync` agent. Facts only; rules live in `CLAUDE.md` and `.claude/`, history in git.

## Product
- LocalGenie = Tauri 2 desktop UI over Qualcomm's GenieX CLI (`geniex`), which runs local LLMs on CPU/GPU/NPU. Primary target: Windows ARM64.
- Model path for Hugging Face GGUF: the app downloads the file itself (`download_file`, resumable via `<file>.part` + HTTP Range), then imports it with `geniex pull <repo>:<precision> --model-hub localfs --local-path <dir>` (`import_gguf`). Hub pulls are no longer used by the app.
- Qualcomm AI Hub code is legacy-in-progress, not to be expanded: `list_aihub_models`, `AihubModel`, `ModelInfo.source = "aihub"`, the "qualcomm" browse area (HF `author=qualcomm` intersected with `geniex model list`, `compatibleNames`). The compat badge input `assetCompat` is never populated (no caller of `setAssetCompat`).
- Unit tests: vitest (`npm test`), files `*.test.ts` in `utils/` and `services/database.test.ts`. No UI tests. Backlog: `tasks.md` (user-owned).

## Stack
React 19 + TS 5.8 + Vite 6, Fluent UI v9 (`@fluentui/react-components`), zustand 5, react-router-dom 7 (MemoryRouter), react-markdown + rehype-highlight. Biome for lint/format. Rust: tauri 2 (`tray-icon` feature; `tray.rs`), tauri-plugin-shell (capability `shell:allow-open` only; the GenieX CLI is run from Rust, not via the shell plugin), sea-orm 1 (SQLite), tokio, reqwest, sysinfo. Dev port 1420; GenieX server default port 18181.
Window: frameless (`decorations: false`, background `#292929`); the custom `shell/TitleBar/TitleBar.tsx` provides the chrome. Window-control permissions are in `src-tauri/capabilities/default.json`.
CSP (`src-tauri/tauri.conf.json`): `connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*` only. Webview `fetch` to huggingface.co is therefore not allowed as configured (see known-issues). Rust-side `reqwest` calls are not subject to CSP.

## Frontend (`src/`)
- `main.tsx`: `FluentProvider theme={webDarkTheme}` wraps `ErrorBoundary` (fallback `ErrorFallback/ErrorFallback.tsx`).
- Folder rule: a component with its own styling is a folder named after it, holding `X.tsx` and `X.css` (for example `components/ChatInput/ChatInput.tsx`). Components without styles stay flat or get a folder. Old flat paths no longer exist.
- `App.tsx`: scaffolding only. MemoryRouter -> `AppBootstrap` -> `Navigation` + `Toaster` (id `app-toaster`) + `ToastRegistrar`.
- `components/AppBootstrap.tsx`: one-time startup loads only (CLI installed, saved sessions, models, server port and status, CLI update check). No listeners, no persistence.
- `Navigation.tsx`: all routes, all under `MainLayout`: `/` Overview; `/models` (local), `/models/browse` (HF browser), `/models/:repoId` (`HubModelDetailRoute`); `/chat`, `/chat/:sessionId`; `/prompt-benchmark` (index -> `playground`, `dashboard`); `/settings` -> `/settings/app`, `/settings/:section`; `/benchmark` redirects; `*` -> `/`.
- `components/shell/`:
  - `Layouts/Layouts.tsx` `MainLayout`: TitleBar, Sidebar, CliMissingBanner, Header, `<Outlet/>`, CloseGuard, and `ChatRuntime` (mounted here, not in the chat page, so a reply keeps streaming on other pages).
  - `Sidebar/Sidebar.tsx`: vertical Fluent `TabList` for page nav (`CounterBadge` on Models), server footer.
  - `Header/Header.tsx`: model selector (Popover + `ModelSelectorPopover`), connection `Badge`, Downloads button, and `DownloadDrawer`.
  - `Header/useModelLoader.ts`: select/load (with the model's saved load settings), compute change (store only, applies to next message), unload, `server-stopped` listener. Owns all model-lifecycle actions.
  - `Header/ModelSelectorPopover/`: `ModelSelectorPopover.tsx` (presentational; actions come in as props), `ModelOptionButton/ModelOptionButton.tsx`.
  - `DownloadDrawer/`: `DownloadDrawer.tsx` (UI), `useDownloadManager.ts` (Tauri listeners, starts queued entries), `downloadPipeline.ts` (download -> import -> sidecars, `refreshAfterImport`), `DownloadItemCard/DownloadItemCard.tsx`, `DownloadStatusBadge.tsx`.
  - `CliMissingBanner/CliMissingBanner.tsx` (links to the GenieX releases page), `CloseGuard.tsx`, `TitleBar/TitleBar.tsx`.
- `components/chat/`: `ChatRuntime/` (`ChatRuntime.tsx` renders nothing and mounts `useChatStream.ts` and `useSessionPersistence.ts`), `SessionList/` (vertical TabList; delete button for the active conversation), `ThinkingBlock/`, `ChatContextHeader/` (context bar: title on the left; usage ring `ContextRing/` with the window matched by base model name from the downloaded-model row; close button).
- `components/`: `ChatInput/ChatInput.tsx` (send/stop, stream id, failed-send handling), `ChatArea/ChatArea.tsx`, `MessageBubble/MessageBubble.tsx`, `ModelSettings/ModelSettings.tsx` (per-model settings; field rows in `ModelSettings/SettingField/`), `AppSettings/AppSettings.tsx`, `settings/` (`CliUpdateCard`, `ServerLogsCard`, `ServerPortCard`, each a folder), `benchmark/*` (folders), `models/` (`HubModelBrowser/HubModelBrowser.tsx`, `GGUFVariantList.tsx`: quantization picker on `OptionDropdown`).
- `components/ui/` (shared, one folder per component): `Flex` (layout), `Typography` (text scale), `OptionDropdown` (typed Fluent Dropdown), `ChipRow`, `ConfirmDialog`, `ErrorBanner`, `MarkdownContent`, `MetricCard`, `ModelCard`, `PageHeader`, `ProgressBar`, `StateBlock`, `StatusBadge`, `SurfaceCard`. Use-rules: `.claude/agents/react-expert.md`.
- `components/ToastRegistrar.tsx`: renders nothing; routes `utils/toast` calls to the Fluent Toaster.
- `pages/`: one folder per page (`ChatPage/ChatPage.tsx`, `OverviewPage/`, `SettingsPage/`, `LocalModelsBrowserPage/`, `PromptBenchmarkPage/`); `pages/models/`: `HubModelDetail/HubModelDetail.tsx` (`handleDownload` calls `enqueue`), `HubModelDetailRoute.tsx`, `useHubModelDetail.ts` (data hooks, incl. `useDownloadedPrecisions`).
- Stores (`stores/`, state only): `chatStore`, `modelStore` (compute, serverCompute, selectorOpen), `hubBrowseStore` (HF browse state and cache), `downloadStore` (entries, `DownloadStatus` incl. `queued`, `enqueue(variant)`, `isDownloadActive`), `benchmarkStore` (in-memory).
- Services (`services/`, the only `invoke()`/event-API callers; verified by grep): `geniex.ts` (CLI, server, chat, update), `database.ts`, `download.ts` (`downloadFile`, `cancelDownload`, `importGGUF`, `deleteDirectory`), `events.ts` (`listenEvent`), `window.ts`, `system.ts`, `hubApi.ts` (HF REST via `fetch`: models, model info, file tree, README, `fetchContextLength`), `hubModels.ts` (GGUF file listing and grouping).
- `utils/`: `modelSettings.ts` (per-model settings: keys, defaults, engine rules, `resolveLoadParams`, `chatSettingsFor`; vitest test alongside), `toast.ts` (`toast.success|info|error`; no-op until `ToastRegistrar` mounts), `gguf.ts` (filename parsing; spec in `memories/external/gguf/gguf.md`), `format.ts`, `modelFamily.ts`, `thinking.ts`, `chatError.ts`, `async.ts`.
- `hooks/index.ts`: `useTauriEvent` only (one listener per event name, handler in a ref).

## Backend (`src-tauri/src/`)
- `lib.rs`: opens `geniex.db` in the app data dir, runs migrations, manages `AppState` and `DownloadRegistry`, registers commands, kills the server PID on window destroy. Modules also include `gguf.rs` and `tray.rs`.
- `commands/` (one domain per module): `models` (list, list_aihub, remove, clean, set_type), `hub` (search_models), `server` (start/stop/status, PID tracking), `chat` + `chat_helpers` (load_model, unload_all_models, chat_completion, cancel; `ModelLoadParams`, `apply_load_params`, `build_chat_body`), `cli` (check installed, config get/set/list, `resolve_geniex_executable`), `cli_update` (check_for_cli_update, update_geniex), `download` (download_file, cancel_download), `import` (import_gguf, delete_directory), `database` (sessions, messages, chat errors, settings, model settings, downloaded models), `logs`, `system` (memory), `constants`.
- Entities: `chat_session`, `message`, `chat_error`, `model_setting`, `user_preference`, `downloaded_model` (name PK; precision, context_size, param_count, repo_url, model_card, timestamps).
- Migrations: `m20260730_000001_create_tables`, `m20261007_000001_downloaded_models`, `m20261020_000001_add_repo_columns`, `m20261022_000001_message_finish_and_errors` (`messages.finish_reason`, `chat_errors` table), `m20261022_000002_message_stats`.

## Events (verified by grep of `emit`/listeners)
- `download-progress` `{ id, file, received, total, speed }`, `{ ..., complete: true }`, `{ id, file, cancelled: true }`. `id` = Hugging Face repo id (download id).
- `model-pull-start` `{ model }`, `model-pull-progress` `{ model, message }`, `model-pull-complete` `{ model }`: emitted by `import_gguf` only (GenieX local import). Listened to in `useDownloadManager.ts`.
- `chat-chunk` `{ streamId, content }`; `chat-done` `{ streamId, finishReason }` (also emitted on user cancel, with `finishReason` `cancelled`). Stats are computed in the frontend (`useChatStream.ts`).
- `server-stopped` (no payload; `useModelLoader`), `server-log` `ServerLogLine` (`ServerLogsCard`), `geniex-update-progress` `{ message }` (`CliUpdateCard`).

## IPC contract (committed; backend and `services/` agree at HEAD)
- `download_file(download_id, url, file_name)`: `download_id` first; no `precision` argument.
- `cancel_download(download_id)`: matches the drawer entry id.
- Removed: `pull_model`, `install_geniex`, `get_geniex_version` (backend and frontend wrappers).
- `import_gguf(local_path, repo_id, filename, precision)` returns the import folder; `delete_directory(path)` is limited to paths inside the Downloads folder.
- `save_chat_error`, `delete_chat_error` (used by `ChatInput/ChatInput.tsx`, `services/database.ts`).
- Unchanged names: `check_for_cli_update`, `update_geniex`, `search_models`, `delete_directory`, `import_gguf`.
- Uncommitted (IPC contract change, `services/geniex.ts` updated to match): `load_model(model, baseUrl?, load?)` where `load: ModelLoadParams` (camelCase: `nctx`, `ngl`, `compute`, `powerMode`, `specType`, `specDraftModel`, `specNMax`, `specNMin`, `specPMin`). `chat_completion` settings (`GenerationSettings`) gain `seed`, `grammarString`, and flattened load params; `nctx` moved to load params. Same command name and arguments otherwise.
- `load_model_settings(modelId)` / `save_model_settings(modelId, settings)` (`database.rs`, `services/database.ts`): JSON per model, key = model name without `:precision`. Committed; the frontend now uses them.

## Key flows
- GGUF download: `HubModelDetail` -> `downloadStore.enqueue(variant)` (status `queued`) -> `useDownloadManager` effect -> `runGGUFDownload` (`downloadPipeline.ts`): `download_file` (`.part`, Range resume, cancel via `cancel_download`) -> `import_gguf` (`model-pull-start` sets `importing`) -> `delete_directory(<folder>)` -> sidecars (best-effort). `model-pull-complete` sets `finished` and runs `refreshAfterImport` (downloaded-model row from Hub `context_length` or DB fallback, then CLI model list refresh). Cancel of a queued entry removes it; of an active entry calls `cancel_download`. Resume = `enqueue` again; the `.part` file is reused. Other failures set `error`.
- Model settings (uncommitted): saved per model in `model_settings`. Load parameters (`nctx`, `ngl`, `compute`, `powerMode`, `spec*`) are sent with the warmup and with every chat request, so the server does not reload. Server-start settings (`origins`, `keepalive`) are the only ones that restart the server. `grammarString` and `think` (`enable_think`) are per-request generation settings. QAIRT (AI Hub) models ignore most of these (`utils/modelSettings.ts`, `loadSettingDisabledReason`).
- Model load (header): `start_server` if not running or if its server settings (origins, keepalive) differ from the running server's (`serverOptions`; an external server is reused as is) -> `load_model` with the saved load params (1-token warmup request; checks the model is listed) -> active model. Compute change in the header only sets the default for the next message. Unload = stop the server (`unload_all_models`; the only unload mechanism; no per-model unload exists in GenieX).
- Chat: `ChatInput` sends with a `streamId` and the model's settings (`chatSettingsFor`); `chat-chunk`/`chat-done` are matched to `chatStore.activeStream` by id, so tokens go to the session that started the stream. Sessions are saved debounced (500 ms, changed sessions only) by `useSessionPersistence`, flushed on unmount. A failed send adds an error message and saves a `chat_errors` row.
- Toasts: only for operations the user waited on (download start/finish/cancel/fail, model load/switch/unload, chat failure, model removal, model settings saved). Not used for background list or conversation loads.
- CLI update: installer-based, see `cli-update.md`.

## Docs/agents landscape
- `memories/repo/*`: the one source for repo knowledge and explanations of changes. Maintained by `knowledge-sync`. `geniex-server-behaviour.md`: GenieX server facts LocalGenie depends on (model cache, chat defaults, gaps).
- Official GenieX repo (github.com/qualcomm/GenieX) is a read-only reference; the facts above were checked against its `cli/` source at GenieX CLI v0.9.3, as of 2026-10-22.
- `memories/geniex-cli-reference.md`: full `geniex` CLI flags. Kept as written; updated by hand when the CLI changes.
- `memories/external/*`: HF Hub OpenAPI and GGUF spec (large, read on demand).
- `CLAUDE.md`: essentials and routing. `tasks.md` at the root: backlog written by the user for other sessions.
- `.claude/agents/*` and `.claude/skills/*`: working rules (`react-expert.md` has the visual rules).
- `.claude/archive/github/`: former `.github/` rule and agent copies, kept for reference, not loaded.
- `.claude/agents/knowledge-sync.md` keeps `memories/repo/*` current; cursor in `.claude/knowledge-sync.state`.

## Known doc drift (not fixed here)
- `components/ui/Typography` is not yet used everywhere: about 96 lines in `src/` still mention Fluent `Text`/`Caption1`/`Body1`/`Title3`/`Subtitle1` (rough grep count, includes imports).
- `components/shell/CliMissingBanner/CliMissingBanner.tsx` and `pages/models/HubModelDetail/HubModelDetail.tsx` import `open` from `@tauri-apps/plugin-shell` directly, against the "Tauri calls only in `services/`" rule (code-verified; present at HEAD too). Not fixed here.
- `components/shell/Header/ModelSelectorPopover/ModelSelectorPopover.css` has unused `.model-selector__list`, `__section`, `__compute`, `__inline` rules.
