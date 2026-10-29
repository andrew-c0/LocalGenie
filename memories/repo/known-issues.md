# Known issues

Status labels: **code-verified** = read in the source (committed up to 694a036, or in the uncommitted working tree, as noted); **runtime-unverified** = not run. Nothing was launched in the 2026-10-26, 2026-10-27, 2026-10-28 or 2026-10-29 syncs (the benchmark suite and the chat settings were read, not run). Items marked "reported" come from live runs noted by the user (2026-10-23) and were not re-run here.

## Active
- Model load/chat hangs: the GenieX warmup request in `load_model` may never get a response. The warmup carries the model's load params (committed in 6068a81), so it matches chat. Not re-validated (runtime-unverified).
- Normal chat depends on a successful model load.
- Known gaps (GenieX limits, not LocalGenie bugs): no per-model unload (only stopping the server unloads; see `geniex-server-behaviour.md`); the GenieX chat endpoint ignores `stop`, so LocalGenie has no stop-sequence setting (code-verified).
- Webview `fetch` to `huggingface.co` (`hubApi.ts`, incl. `fetchContextLength` used by `downloadPipeline.ts`) is not listed in the CSP `connect-src` in `tauri.conf.json`, yet the Hub browser works in the app (reported 2026-10-28: the filters load results). The reason is not established; the policy as written suggests it should be blocked. Treat as a question, not a bug, until checked in the webview console.
- Context size from the Hub now reads only `gguf.context_length` (code-verified in `hubApi.ts`). The earlier `max_position_embeddings` / `max_sequence_length` fallback is gone, so models without GGUF metadata fall back to the DB row (possibly null).
- `HubModelDetail` loads downloaded precisions once per repo (`useDownloadedPrecisions` in `pages/models/useHubModelDetail.ts`, keyed on `repoId`), so "Load & Chat" does not appear until the page is reopened after an import (code-verified; runtime-unverified).
- Local import fails for GGUF repos whose weight files contain `mtp` in the name (GenieX `is_weight_gguf` skips them; "has no model files GenieX can load"). Workaround: rename the folder and files to remove the `mtp` token, then import. The fix belongs to GenieX (see `geniex-server-behaviour.md`); LocalGenie does not change it (reported, verified on one machine).
- Typed event payloads and typed errors are not in place; UI matches on error text (`utils/chatError.ts`).
- Qwen3.5 thinking probe needs the 1024-token budget: at 200 tokens the closing tag is not reached (reported; the 200 cap is `THINK_MAX_TOKENS`, the stream cap `THINK_STREAM_MAX_TOKENS` = 1024, `capability_scan.rs`).
- Active badge clipped: in the model selector, a row that is active, not loaded and has four capability icons overflows the 120px capabilities cell (reported; `ModelOptionButton.tsx` and its CSS). Not fixed.
- Think token for templates that read it (Gemma 4 style, `<|think|>`): sent in the system turn only when the stored GGUF summary has `think_token`, and stripped from every message when thinking is off (code-read; `chat_helpers.rs` tests cover the string handling; uncommitted; runtime-unverified in this sync).
- Hub facets and the filter panel (committed 2122ed2; code-read, runtime-unverified): the filters are sent as Hub tags and `num_parameters`, and the tag catalogue comes from `/api/models-tags-by-type`. The Hub's tag and filter semantics are not checked against a live response in this sync.
- Fixed: the local model lookups in `pages/models/useHubModelDetail.ts` matched rows with a substring test (`repoId.includes(name)`). They now match the exact id or the id with a precision suffix (`isSameRepo`).
- Vision and audio probes match whole words only (`has_word`), so a reply that names the colour or number only inside another word does not count (`capability_scan.rs` tests `names_match_whole_words_only`).

## Playground and optional runtimes (committed 42dea0c..11d5c28 and the working tree; runtime-unverified)
- **GPU (Adreno, OpenCL): blank white image with CFG above 1.** sd.cpp's batched CFG forward breaks on the OpenCL backend (CFG 1.0 works). The app passes `--batched-cfg off` for every non-CPU device and, in the working tree, for every init-image (Image to image re-draw) job on CPU too: batched CFG gave blank images there as well (maintainer-verified; `playground/args.rs`). The cause inside ggml-opencl is not confirmed. Re-test both cases after each fork sync; drop the flag when fixed. Reported by the maintainer (research notes, section 11, 2026-10-29), not re-run here.
- **GPU is slower than the CPU** in every measurement so far (maintainer, same notes; figures there). The app defaults to Auto = CPU. The Compute help text says so (`utils/playgroundText.ts`). The help text also warns that about 128 px images may come out blank; that was not checked here.
- **NPU is not supported** in the Playground (Compute help text). The device list shows whatever sd-cli reports; an HTP or Hexagon device is classed as NPU (`devices.rs`). Not run.
- **Speech compute is CPU only.** The prebuilt sherpa-onnx ARM64 build has no DirectML, so there is no GPU. The CLI has QNN options for QNN-format models; untested, not offered in the app (maintainer report, 2026-10-29).
- **Speech text is ASCII only.** Non-ASCII text for text to speech is converted before it reaches sherpa-onnx (`speech_args.rs`: accented Latin letters to their base letter, typographic punctuation to ASCII, anything else to a space), since the command line cannot carry it. Other scripts are lost. Code-read; known limitation.
- **Speech models are English only** (`whisper-tiny-en`, `moonshine-base-en`, Kokoro with the 28 English voices). Piper and `kokoro-en-v0_19` are not offered: sherpa-onnx 2.0 removed espeak-ng, and those models need a lexicon (research plan, section 12).
- **Microphone capture** uses the webview's `getUserMedia` and a deprecated script-processor node (`services/microphone.ts`). Permission behaviour in the Tauri webview and the recorded sample rate were not checked.
- **Explicit-version runtime install:** the release lookup for a chosen version uses the spec's `git_tag` (`v` prefix for sherpa-onnx; code-read, unit-tested). Not run against GitHub.
- **Latest release for installs (fixed in the working tree, not committed).** At 0e0dcb5, `runtime_install` (no version) and `runtime_check_update` use GitHub's `releases/latest`. Upstream stable-diffusion.cpp publishes x64-only builds as latest, so that could fail or pick a build with no ARM64 archive. The working tree picks the newest non-draft, non-prerelease release that has the ARM64 archive (`runtimes/spec.rs` `newest_release`, `runtimes/mod.rs` `latest_matching_release`). Code-read; a unit test covers it; not run against GitHub.
- **Release cache can hide a newer release.** `ReleaseCache` keeps the lookup for one hour (`RUNTIME_RELEASE_CACHE_SECS`), so an install or update check soon after a new release can see the older one (code-read).
- **Playground model downloads** check the exact byte count from the catalog, not a hash (`model_download.rs`). A file of the right size but different content would pass (code-read).
- **Nothing in the Playground or Runtimes areas has been run in the app**: install, update, uninstall, model download and delete, generation, cancel and the device list are runtime-unverified. The maintainer's test runs cover the Rust and TypeScript code only.

## Qualcomm AI Hub tab (committed 7664d01..55219bc; code-read 2026-10-28, runtime-unverified)
- Reported on 2026-10-28 (not re-run here): runtime 11 (QAIRT Genie bundles: `genie_config.json` plus `ctx-bins`) and runtime 12 (llama.cpp GGUF) load in GenieX. Runtime 6 (Genie bundle) failed to load because it had no `metadata.json`; runtimes 2 (QNN DLC) and 3 (QNN context binary) failed on import or load. Runtimes 2, 3 and 6 are not listed in the tab now (see `codebase-map.md`). The `metadata.json` requirement matches GenieX's `localfs` zip reader (`sdk/model-manager/crates/core/src/source/localfs.rs`, read-only checkout `C:\Work\GenieX`).
- The catalog, detail, model card, download and import were not run in the app or against the live bucket. The version probe (`resolve_version`) relies on the bucket answering 403 for a missing object, which is stated in a code comment and not checked.
- The detail page lists the assets of every chipset and does not filter by the device; the asset picker shows a `This device` / `Other chipset` badge and disables Download for another chipset. The backend refuses it too ("This AI Hub asset is for X, and this device is Y"). An unset GenieX `chipset` allows only universal assets.
- Chipset matching normalises names (AI Hub `qualcomm-snapdragon-x-elite` against GenieX's `Snapdragon X Elite CRD`). Not run against a live device report.
- The download gate is in memory: a zip can be downloaded only after its model page was opened in the same session (`AihubCache.asset_urls`). After a restart, open the page first.
- `geniex pull qualcomm/<Name>:<precision> --model-hub localfs --local-path <zip>` is the import path for runtime 11; the precision label is taken from the app (`validate_precision`), and whether GenieX accepts the label for a zip was not verified.
- The AI Hub tab's card description is hard-coded `QAIRT · N chipsets`, so a GGUF-only model is labelled QAIRT (code-read, `AihubBrowser.tsx`).

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

## Benchmarks (committed in 63f1fbc; runtime-unverified)
- The runner's compute and power recording (`benchmark_runner.rs` `Sampler` and `sample_usage`; `power.rs` power plan and battery) has not been verified against a live model in the app. Power is Windows only (`powercfg`, battery status); elsewhere the fields are null.
- Bottom-left usage graph (`SystemUsage`, `get_system_usage(port)`): it follows only the server on the configured port. A server started on another port is not measured (code-verified; runtime-unverified).
- Bandwidth, thermals and VRAM are not recorded by any run: no source exists in `src/` or `src-tauri/` (grep, 63f1fbc); the old telemetry tiles (`TelemetryValues`) were removed.
- Overview's "Recent Generation Speeds" (`components/benchmark/SpeedList`) reads chat message stats from `chatStore`, not benchmark runs (code-verified).
- Biome: `npx biome check src/` reports 9 format errors, pre-existing and not changed by 63f1fbc: `ModelSettings/ModelSettings.css`, `ModelSettings/ModelSettings.tsx`, `ModelSettings/SettingField/SettingField.css`, `SettingField.tsx`, `ModelSettings/useModelSettingsForm.ts`, `models/GGUFVariantList.tsx`, `shell/Layouts/Layouts.css`, `Layouts.tsx`, `ui/PageHeader/PageHeader.css`. Formatting drift only; not fixed here.

## Chat settings, system lines and download folders (961d167 range; code-verified, runtime-unverified)
- Per-conversation settings, the model-change system lines, the per-repo download folder and the import cleanup have not been run in the app.
- The GGUF download folder is shared by every variant of a repo. The import removes every `mmproj*` file in the folder that is not the variant's own projector (`remove_other_projectors`), so two variants of one repo must not be imported with projectors in the same folder at once. The queue keys downloads by repo, so this is not expected to happen (code-read only).

## UI follow-ups
- Header Downloads button still uses `appearance="subtle"` (`Header/Header.tsx`), against the agreed visual rule (secondary/primary).
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
- Benchmark "Run Benchmark" only toggled visual state, and run history was in memory only (`benchmarkStore`). A suite now runs through `start_benchmark_run` and each run is saved to `benchmark_runs` (63f1fbc: `commands/benchmark_runner.rs`, `commands/benchmark_runs.rs`). The Playground, Performance Dashboard and `benchmarkStore` were removed, with their disabled Export and Save Preset buttons.
- Every stop or unload was reported as `server-stopped`, so a user unload looked like a crash. Now only an unexpected child exit emits it (committed in 1b5d554: `commands/server.rs`, PID cleared before the kill).
- A load with no saved context window used a fixed 4096. It now uses the model's native `context_size` (committed in 1b5d554: `resolveLoadParams`, `loadNativeContext`).
- The loaded-model list came from `/v1/models`, which lists every cached model, so cached models showed as loaded. It now reads `GET /status` `models[].id` (`server.rs` `fetch_loaded_models`; code-verified against the GenieX `status` handler; runtime-unverified in the app).
- Sidecars (mmproj) were downloaded after the import, but the import doc comment says GenieX copies only what is in the model folder, so they were not in the folder when GenieX read it. Sidecars are now downloaded first into the repo's download folder, and `import_gguf` imports that folder (`downloadPipeline.ts`, `import.rs`; runtime-unverified). Later the move step and `delete_directory` were removed (961d167 range); the folder is now cleaned up by the import itself.
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
