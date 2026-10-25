# Known issues

Status labels: **code-verified** = read in the source (committed up to 694a036, or in the uncommitted working tree, as noted); **runtime-unverified** = not run. Nothing was launched in the 2026-10-25 sync. Items marked "reported" come from live runs noted by the user (2026-10-23) and were not re-run here.

## Active
- Model load/chat hangs: the GenieX warmup request in `load_model` may never get a response. The warmup carries the model's load params (committed in 6068a81), so it matches chat. Not re-validated (runtime-unverified).
- Normal chat depends on a successful model load.
- Known gaps (GenieX limits, not LocalGenie bugs): no per-model unload (only stopping the server unloads; see `geniex-server-behaviour.md`); the GenieX chat endpoint ignores `stop`, so LocalGenie has no stop-sequence setting (code-verified).
- Webview `fetch` to `huggingface.co` (`hubApi.ts`, incl. `fetchContextLength` used by `downloadPipeline.ts`) is not allowed by the CSP `connect-src` as configured (code-verified against `tauri.conf.json`). Runtime-unverified; the Hub browser and import metadata may fail. Moving these to Rust is the candidate fix.
- Context size from the Hub now reads only `gguf.context_length` (code-verified in `hubApi.ts`). The earlier `max_position_embeddings` / `max_sequence_length` fallback is gone, so models without GGUF metadata fall back to the DB row (possibly null).
- `HubModelDetail` loads downloaded precisions once per repo (`useDownloadedPrecisions` in `pages/models/useHubModelDetail.ts`, keyed on `repoId`), so "Load & Chat" does not appear until the page is reopened after an import (code-verified; runtime-unverified).
- Local import fails for GGUF repos whose weight files contain `mtp` in the name (GenieX `is_weight_gguf` skips them; "has no model files GenieX can load"). Workaround: rename the folder and files to remove the `mtp` token, then import. The fix belongs to GenieX (see `geniex-server-behaviour.md`); LocalGenie does not change it (reported, verified on one machine).
- Typed event payloads and typed errors are not in place; UI matches on error text (`utils/chatError.ts`).
- Qwen3.5 thinking probe needs the 1024-token budget: at 200 tokens the closing tag is not reached (reported; the 200 cap is `THINK_MAX_TOKENS`, the stream cap `THINK_STREAM_MAX_TOKENS` = 1024, `capability_scan.rs`).
- Active badge clipped: in the model selector, a row that is active, not loaded and has four capability icons overflows the 120px capabilities cell (reported; `ModelOptionButton.tsx` and its CSS). Not fixed.
- Vision and audio probes match whole words only (`has_word`), so a reply that names the colour or number only inside another word does not count (`capability_scan.rs` tests `names_match_whole_words_only`).

## Chat attachments (code-verified, runtime-unverified)
- mp3 input is not verified with the server. The chat path sends `input_audio` with `format` `mp3` when the file is an mp3; GenieX accepts the format name and writes a temp file (code-read). The audio scan probe uses wav, so wav is the only format the scan has exercised.
- A message saved before paths were kept (a ref with no `path`) has no Retry button, and every send in its session warns "Files not sent" and leaves that file out, because the history is rebuilt from all messages. The warning repeats on each send until that message is deleted (Delete on the bubble, with every later message; `MessageBubble.tsx` `removeFrom`). The model does not see the file in the meantime (code-read; not run).
- A stored file that was moved or deleted is left out of every later send and Retry in its session the same way: the send goes ahead, a "Files not sent" toast names it, and the toast repeats until its message is deleted. Its tile shows "no longer at its path" when opened.
- Text files are re-read from disk on every later turn. The first send uses the copy read at attach time, so an edit made after that changes what the model gets from the next turn on.
- Context total: text files are an estimate (characters / 4) until a reply reports counts; after that, the server's exact total covers them and only later files are estimated. Images and audio have no token estimate, so they count only in the exact total after a reply.
- The usage stream is unverified in a live run. GenieX sends the usage chunk when `include_usage` is set (code-read). Without counts (a stopped reply, or no usage chunk), the total falls back to the estimate from the last counted reply.
- Images above 1536 px on the long edge are re-encoded as JPEG (quality 85) before sending. The effect of that on answers is not tested.
- Vision and audio are gated by a `works` scan result for the active model. A file of a kind the active model cannot take, anywhere in the session, blocks the send (`modelTakesFiles`), so switching to a model without the scan result blocks the old files too.
- Limits (code-verified in `commands/attachments.rs`, `utils/attachments.ts`): 4 files per message, 10 MB for image and audio, 512 KB UTF-8 for text. The "Open location" action is Windows only.
- Earlier cache overwrite (a second quant of the same repo replaced the first in the cache) was not reproduced in isolation. The observed loss was explained by a manual removal (reported). Treat as unconfirmed.

## UI follow-ups
- Header Downloads button still uses `appearance="subtle"` (`Header/Header.tsx`), against the agreed visual rule (secondary/primary).
- Benchmark "Run Benchmark" only toggles visual state; no backend benchmark command. Dashboard "Export" and Playground "Save Preset" are disabled.
- Benchmark run history is in-memory only (`benchmarkStore`).
- Hardware telemetry (NPU/VRAM, thermals, bandwidth, power) has no backend source; the benchmark tiles show "—" (no N/A badge since 7d7b1ed).
- Syntax highlighting: `rehype-highlight` runs only with `allowHtml`, and no highlight.js theme is imported.
- Page padding choice is undecided.
- The UI has not been run since the Fluent migration, the frontend changes since 1b5d554, or the chat attachment and delete-message work (runtime-unverified).

## Open follow-ups (migrated from the 2026-10-22 repo scan; verify before fixing)
- Cancel registry leak: an error mid-stream returns before the request is removed from `CANCEL_FLAGS` in `commands/chat.rs`. Use a drop guard.
- SSE buffer: `chat.rs` copies the whole buffer on every line. Use `drain`.
- HTTP clients: `download.rs` and `models.rs` build a `reqwest::Client` per call. Use the shared client.
- `run_geniex` in `models.rs` has no timeout, so a hung `geniex list` blocks startup. `cli.rs` already has one; reuse it.
- `cli.rs`: the release fetch is duplicated between check and update; timeouts and retry counts are magic numbers (move to `constants.rs`).
- `search_models` in `models.rs` parses the body before checking the HTTP status, so an HF error page reads as "Failed to parse".
- `load_sessions` (`database.rs`) matches messages with a nested `find` and loads every session at startup. `list_downloaded_models` returns the full `model_card` text the grid does not need.
- Migration `m20261020_000001` (`add_repo_columns`) ignores every `ALTER TABLE` error. `delete_session` runs two statements without a transaction.
- Security: `update_geniex` runs the downloaded installer without checking the release asset digest.
- Tauri calls outside `services/`: `CliMissingBanner` and `HubModelDetail` import `open` from `@tauri-apps/plugin-shell` directly.
- Stale comments: `UpdateInfo` in `cli.rs` is called a re-export.
- Chat streaming cost: `updateLastAssistantMessage` still rebuilds the message and `contextChars` on each flush. Chunks are written once per animation frame (`useChatStream.ts`, committed in 1b5d554), so the rate is lower; the rebuild itself is unchanged (code-verified).
- `DEFAULT_BASE_URL` duplicates `DEFAULT_PORT` in `constants.rs`. `package.json` has an `allowScripts` field, which is not a standard npm field.

## Operational notes
- No per-model unload endpoint in the GenieX CLI; stopping the server is the only unload.
- The port is configurable and persisted in `user_preferences` (default `18181`).
- The running server PID is cleared when the `geniex serve` child exits, so a crashed server can be started again (code-verified in `server.rs`; runtime-unverified).

## Resolved (code-verified; runtime-unverified)
- Every stop or unload was reported as `server-stopped`, so a user unload looked like a crash. Now only an unexpected child exit emits it (committed in 1b5d554: `commands/server.rs`, PID cleared before the kill).
- A load with no saved context window used a fixed 4096. It now uses the model's native `context_size` (committed in 1b5d554: `resolveLoadParams`, `loadNativeContext`).
- The loaded-model list came from `/v1/models`, which lists every cached model, so cached models showed as loaded. It now reads `GET /status` `models[].id` (`server.rs` `fetch_loaded_models`; code-verified against the GenieX `status` handler; runtime-unverified in the app).
- Sidecars (mmproj) were downloaded after the import, but the import doc comment says GenieX copies only what is in the model folder, so they were not in the folder when GenieX read it. Sidecars are now downloaded first and moved into the folder by `import_gguf` (`downloadPipeline.ts`, `import.rs`; runtime-unverified).
- Settings `nctx` and `think` had no effect. Now `nctx` and the other load params go to `load_model` and every chat request, and `think` is sent as `enable_think` (committed in 6068a81: `commands/chat_helpers.rs`, `utils/modelSettings.ts`, `Header/useModelLoader.ts`). Reported live run (not re-run by knowledge-sync): against `geniex serve` v0.9.3 with `unsloth/Qwen3.5-0.8B-GGUF` Q8_K_XL, a warmup then a chat with identical params did not reload, and a changed `nctx` did reload.
- Chat events carry `streamId`; `useChatStream` applies them only to the active stream, so a stream keeps its session when the user switches chats (`chat-chunk`/`chat-done` in `ChatRuntime/useChatStream.ts`). The stream also keeps running on other pages, since `ChatRuntime` is mounted in `MainLayout`.
- Per-response stats (TTFT, total time, token count, prompt chars) are saved with the message (`messages` columns from `m20261022_000002`; `database.rs`, `services/database.ts`), so they survive a reload. Stats are computed in `useChatStream.ts`.
- Failed sends are saved as `chat_errors` rows (`ChatInput/ChatInput.tsx` -> `save_chat_error`; migration `m20261022_000001`), so they survive a reload. Whether a failed send is still sent as context on the next turn was not re-checked.
- Download cancel, resume and duplicate guard are keyed by repo id (`downloadStore.enqueue`, `download.rs` `cancel_download`/`register`, `downloadPipeline.ts`). Partial files are `.part` and renamed on success.
- Downloads are started only by the drawer pipeline (`useDownloadManager`), so a second request for an active repo is ignored by `enqueue`.
- README fetch failure no longer fails an import (`import.rs`, `match` instead of `?`).
- Session persistence saves every changed session (`ChatRuntime/useSessionPersistence.ts`).
- `useTauriEvent` subscribes once per event name (`hooks/index.ts`).
- The `install_geniex` stub is removed; the banner opens the releases page (`CliMissingBanner/CliMissingBanner.tsx`).
- Header model selector is wired to `ModelSelectorPopover` (`Header/Header.tsx`), with loading and errors in `Header/useModelLoader.ts`.
- Earlier, from git history: session persistence upsert fix, installer-based CLI update flow and update UI rework (see `cli-update.md`).
