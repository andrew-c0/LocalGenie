# Fix plan: downloads, server state, and cleanup

Source: [code-scan-2026-10-22.md](code-scan-2026-10-22.md). This plan covers the most obvious items from it. Benchmark pages are out of scope.

## Phase 1: download lifecycle (fixes scan 1.1–1.4, 2.1, 4)

Contract change: download events and commands are keyed by a download id (the Hugging Face repo id), not by file name.

- Rust `download_file(download_id, url, file_name)`: validate the file name is a bare name and the URL is `https://huggingface.co/`. Write to `<file>.part`, rename on success, and resume from the `.part` length. Refuse a second download with the same id.
- Rust `cancel_download(download_id)`: matches the drawer's entry id.
- Rust event `download-progress` carries `id`. The frontend maps by `id`; `fileToRepoMap` is removed.
- Frontend `startGGUFDownload(variant)` in `downloadStore.ts`: the single orchestration for download, import, cleanup and sidecars, used by the model page and by resume. It marks the entry as error or cancelled instead of leaving it stuck in "importing".
- The duplicate guard reads active downloads from `downloadStore`. `modelStore.downloads` and the `downloading` prop plumbing are removed.

## Phase 2: server state (scan 1.5)

- Clear the tracked PID when the `geniex serve` child exits, so a crashed server can be started again.
- Replace lock `expect`/`unwrap` in command paths with errors.

## Phase 3: quick fixes (scan 1.6, 1.7, 1.8, 1.10, 1.11, 2.3)

- `import_gguf`: the README fetch is best-effort (done in Phase 1 Rust).
- `fetchDownloadedModelMeta`: fix the context-size ternary and fill context size when the DB row lacks it.
- Install: remove the `install_geniex` stub. The banner links to the releases page instead.
- `ChatInput`: failed sends are saved to the DB, or not added to the context. (Not in this pass: noted as follow-up.)
- Session persistence: save every changed session, not only the active one at timer time.
- `useTauriEvent`: subscribe once per event name, with the handler held in a ref.

## Phase 4: code cleanup

- Remove dead code: `hubApi.ts` release-asset block, `parseParamCount`, `parseGGUFPrecision`, `geniex.pullModel`, `getGeniexVersion`, `chatStore.renameSession`, `modelStore.downloads`, `DownloadProgress`, unused `Navigation` state.
- One GGUF conversion path: `convertToGGUFFiles` lives in `services/hubModels.ts`, which `listGGUFFiles` uses.
- One download helper: `deleteDirectory` replaces the duplicate `cleanupDownloadedModelDirectory`.
- Remove `console.log` in `AppBootstrap`.
- Rust: remove the `pull_model` command, share the GitHub release fetch, and move CLI timeouts into `constants.rs`.

## Not in this pass

- Stream ids on `chat-chunk`/`chat-done` (scan 2.2). Changing the chat event contract is a separate change.
- Typed event payloads and a typed error enum (scan 2.4).
- Moving Hugging Face `fetch` calls to Rust (scan 1.14). Needs a runtime check of the CSP first.
- Security items in scan section 4 beyond the file-name and path checks in Phase 1.
- Tests. The pure helpers are candidates for a follow-up.

## Status

Done (compiled and checked: `tsc` and Biome clean, `cargo clippy --all-targets` clean, `cargo test` passes):

- Phase 1: `download_file`/`cancel_download`/`delete_directory` take and check ids and names, use `.part` files and a shared client, and refuse a second download for the same id. Events are `download-progress` keyed by `id`. `startGGUFDownload` in `downloadStore.ts` is the only orchestration path (model page and drawer resume). The duplicate guard reads `downloadStore`; `modelStore.downloads`, the `downloading` prop and `fileToRepoMap` are removed. `import_gguf` takes the README best-effort.
- Phase 2: the server PID is cleared on exit; lock `expect`/`unwrap` in command paths return errors.
- Phase 3: context-size fallback fixed; install stub and command removed (banner links to the releases page); session saves cover every changed session; `useTauriEvent` subscribes once per event name; startup loads in parallel.
- Phase 4: dead code removed (hubApi release-asset block and `parseParamCount`, `pull_model`, `pullModel`, `getGeniexVersion`, `renameSession`, `modelStore` download fields, `DownloadProgress`, Navigation state). One GGUF conversion path in `services/hubModels.ts`. The shell capability is trimmed to `shell:allow-open`.

Judgement call: the release-asset compatibility badge was never wired (nothing calls `setAssetCompat`), so its helpers were removed. Only the `AssetCompat` type is kept. The code is in git history if the feature is wanted.

Not verified at runtime: nothing was launched. Check download cancel/resume, the duplicate guard, a crashed-server restart, and session persistence in `npm run dev`.

Known follow-ups:
- `HubModelDetail` loads downloaded precisions once per repo, so "Load & Chat" may not appear until the page is reopened after an import.
- Chat failures are not saved, and streams are not tagged with an id (scan 1.9, 1.10).
- `fetchContextSize` and the Hub browser `fetch` calls go through the webview, which the CSP may block (scan 1.14).
- `.claude/knowledge-sync` should run: the codebase map still names `asset-download-progress`, `model-pull-*` for hub pulls, and `install_geniex`.

## Status: scan items and routing

- Hugging Face browsing and downloads work in the app, so the CSP concern is not an open issue.
- Stream ids: `chat_completion` takes a `streamId` from the frontend. `chat-chunk` and `chat-done` carry it, and tokens go to the session that started the stream.
- TODO left in `ChatInput.tsx` for failed sends (shown but not persisted, and sent back as context).
- Logs: the backend keeps the last 2000 `geniex serve` lines (`commands/logs.rs`). Settings → Logs shows them and streams new lines.
- Removed: the duplicated server model fetch in Rust, dead TypeScript exports, `uuid`. `unload_all_models` now gets the active port.
- Frontend: `serverBaseUrl()` builds the server URL. Two tests cover GGUF parsing and grouping; two cover the concurrency helper. `npm test` runs `vitest run`.
- Concurrency: GGUF lookups for search results run four at a time, and in-flight ids are tracked.
- Routes: `/chat`, `/chat/:sessionId`, `/settings/:section`, `/models` (local), `/models/browse` (Hugging Face). The benchmark already used sub-routes and was not changed.
- Decision: the URL decides which chat is open. `loadSessions` no longer picks one.

Left in place: `allowScripts` in `package.json` (not sure what reads it), and the `18181` default in both `modelStore.ts` and `constants.rs`, which can't be shared across languages without codegen.
