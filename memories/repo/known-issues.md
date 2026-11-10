# Known issues

Status labels: **code-verified** = read in the source (committed up to 694a036, or in a later commit named in the section); **runtime-unverified** = not run. Nothing was launched in the 2026-10-26 to 2026-10-30 syncs (the benchmark suite and the chat settings were read, not run). Items marked "reported" come from live runs noted by the user (2026-10-23) and were not re-run here.

## Active
- Model load/chat hangs: the GenieX warmup request in `load_model` may never get a response. The warmup carries the model's load params (committed in 6068a81), so it matches chat. Not re-validated (runtime-unverified).
- Normal chat depends on a successful model load.
- Known gaps (GenieX limits, not LocalGenie bugs): no per-model unload (only stopping the server unloads; see `geniex-server-behaviour.md`); the GenieX chat endpoint ignores `stop`, so LocalGenie has no stop-sequence setting (code-verified).
- Webview `fetch` to `huggingface.co` (`hubApi.ts`, incl. `fetchContextLength` used by `downloadPipeline.ts`) is not listed in the CSP `connect-src` in `tauri.conf.json`, yet the Hub browser works in the app (reported 2026-10-28: the filters load results). The reason is not established; the policy as written suggests it should be blocked. Treat as a question, not a bug, until checked in the webview console. Unresolved. The offline mode (27e98d1) adds to it: a fetch the webview blocks throws the same `TypeError: Failed to fetch` as a dead connection, so the screens would read "You appear to be offline" while online (code-read inference, not run).
- Context size from the Hub now reads only `gguf.context_length` (code-verified in `hubApi.ts`). The earlier `max_position_embeddings` / `max_sequence_length` fallback is gone, so models without GGUF metadata fall back to the DB row (possibly null).
- Local import fails for GGUF repos whose weight files contain `mtp` in the name (GenieX `is_weight_gguf` skips them; "has no model files GenieX can load"). Workaround: rename the folder and files to remove the `mtp` token, then import. The fix belongs to GenieX (see `geniex-server-behaviour.md`); LocalGenie does not change it (reported, verified on one machine).
- Typed event payloads and typed errors are not in place; UI matches on error text (`utils/chatError.ts`).
- Qwen3.5 thinking probe needs the 1024-token budget: at 200 tokens the closing tag is not reached (reported; the 200 cap is `THINK_MAX_TOKENS`, the stream cap `THINK_STREAM_MAX_TOKENS` = 1024, `capability_scan.rs`).
- Active badge clipped: in the model selector, a row that is active, not loaded and has four capability icons overflows the 120px capabilities cell (reported; `ModelOptionButton.tsx` and its CSS). Not fixed.
- Think token for templates that read it (Gemma 4 style, `<|think|>`): sent in the system turn only when the stored GGUF summary has `think_token`, and stripped from every message when thinking is off (code-read; `chat_helpers.rs` tests cover the string handling; committed 2122ed2; runtime-unverified).
- Hub facets and the filter panel (committed 2122ed2; code-read, runtime-unverified): the filters are sent as Hub tags and `num_parameters`, and the tag catalogue comes from `/api/models-tags-by-type`. The Hub's tag and filter semantics are not checked against a live response in this sync.
- Fixed: the local model lookups in `pages/models/useHubModelDetail.ts` matched rows with a substring test (`repoId.includes(name)`). They now match the exact id or the id with a precision suffix (`isSameRepo`).
- Vision and audio probes match whole words only (`has_word`), so a reply that names the colour or number only inside another word does not count (`capability_scan.rs` tests `names_match_whole_words_only`).

## RAM estimate (committed ae6e31a to 0cc9a85; tested in the app by the user, 2026-10-31)
- The RAM figures are stored per downloaded model (migration `m20261036`, `commands/ram_store.rs`; bbe159f; tested by the user 2026-11-03). A figure is written at import and when the saved `nctx` changes; a row without one is filled at startup by `backfill_model_ram`, and a row that fails stays null until the next start.
- RAM estimate constants are not validated: the 10% compute buffer with a 256 MiB floor, the 120% and 110% flat factors, the 8192 context cap and the 4096 fallback (`ram_estimate.rs`, `model_ram.rs`) are not checked against the measured memory of a loaded model.
- Default context window (78dae29; code-read, not run in the app): with no saved `nctx`, a model with a longer native context now loads with 8192 (`defaultContextFor`), not its full length. The stored RAM figure assumes the same cap. Whether 8192 is the right default is a product choice, not measured.

## Playground and optional runtimes (committed 42dea0c..b9617e6; tested in the app by the user 2026-10-31, except voice cloning)
- **GPU (Adreno, OpenCL): blank white image with CFG above 1.** sd.cpp's batched CFG forward breaks on the OpenCL backend (CFG 1.0 works). The app passes `--batched-cfg off` for every non-CPU device and for every init-image (Image to image re-draw) job on CPU too: batched CFG gave blank images there as well (maintainer-verified; `playground/args.rs`). The cause inside ggml-opencl is not confirmed. Re-test both cases after each fork sync; drop the flag when fixed. Reported by the maintainer (research notes, section 11, 2026-10-29), not re-run here.
- **GPU is slower than the CPU** in every measurement so far (maintainer, same notes; figures there). The app defaults to Auto = CPU. The Compute help text says so (`utils/playgroundText.ts`). The help text also warns that about 128 px images may come out blank; that was not checked here.
- **NPU is not supported** in the Playground (Compute help text). The device list shows whatever sd-cli reports; an HTP or Hexagon device is classed as NPU (`devices.rs`). Not run.
- **Speech compute is CPU only.** The prebuilt sherpa-onnx ARM64 build has no DirectML, so there is no GPU. The CLI has QNN options for QNN-format models; untested, not offered in the app (maintainer report, 2026-10-29).
- **Speech text is ASCII only.** Non-ASCII text for text to speech is converted before it reaches sherpa-onnx (`speech_args.rs`: accented Latin letters to their base letter, typographic punctuation to ASCII, anything else to a space), since the command line cannot carry it. Other scripts are lost. Code-read; known limitation.
- **Clean up or split (Audio tool):** GTCRN output is 16 kHz mono (catalog description); that format was not measured here.
- **Speech models are English only** (`whisper-tiny-en`, `moonshine-base-en`, Kokoro with the 28 English voices). Piper and `kokoro-en-v0_19` are not offered: sherpa-onnx 2.0 removed espeak-ng, and those models need a lexicon (research plan, section 12).
- **Microphone capture** uses the webview's `getUserMedia` and a deprecated script-processor node (`services/microphone.ts`). Permission behaviour in the Tauri webview and the recorded sample rate were not checked.
- **Explicit-version runtime install:** the release lookup for a chosen version uses the spec's `git_tag` (`v` prefix for sherpa-onnx; code-read, unit-tested). Not run against GitHub.
- **Latest release for installs (fixed in code).** At 0e0dcb5, `runtime_install` (no version) and `runtime_check_update` use GitHub's `releases/latest`. Upstream stable-diffusion.cpp publishes x64-only builds as latest, so that could fail or pick a build with no ARM64 archive. The code now picks the newest non-draft, non-prerelease release that has the ARM64 archive (`runtimes/spec.rs` `newest_release`, `runtimes/mod.rs` `latest_matching_release`). Code-read; a unit test covers it; not run against GitHub.
- **Release cache can hide a newer release.** `ReleaseCache` keeps the lookup for one hour (`RUNTIME_RELEASE_CACHE_SECS`), so an install or update check soon after a new release can see the older one (code-read).
- **Playground model downloads** check the exact byte count from the catalog, not a hash (`model_download.rs`). A file of the right size but different content would pass (code-read).
- **Voice cloning is untested in the app** (the Audio tool's other tasks were tested by the user; see "Audio tool" below). Pocket TTS (speak task) was committed as "not manually tested yet"; only unit tests cover it. Upscaling runs `sd-cli --upscale-model`, CPU only (the GPU backend crashes on upscaling). Steps: `manual-checklist.md`.
- **OCR cancel does not stop the server.** A cancel drops the HTTP request; the GenieX server may keep generating until it notices the closed connection (`ocr_job.rs`). Code-read.
- **OCR needs the GenieX server running.** The run fails with "Start the GenieX server first" otherwise; the tab can start it. Whether the server loads the OCR model on the first request, and the `compute` / `vit_compute` request fields, are read from the code only (see `geniex-server-behaviour.md` for what is verified).
- **Duplicated server-start sequence.** `components/playground/OcrPanel/startOcrServer.ts` (called when an OCR model is picked in the header selector; it replaces `useOcrServer`) repeats the start sequence of `shell/Header/useModelLoader.ts` (read server settings, `startServer` on the configured port, `setServerStatus`, `setServerOptions`). Chat has no shared function for it, so a change to one must be mirrored by hand. Code-read; not unified.
- **Runtime status of the Playground**: text to image (before its 2026-11-05 redesign), image to image (before its 2026-11-05 redesign), image upscaling (before its 2026-11-05 redesign), OCR, and the speech tools (2026-10-31; now the Audio tool, see "Audio tool") have been run in the app by the user. Voice cloning is still unverified there; the Runtimes update and uninstall flows have no recorded result.
- **OCR page redesign not run in the app** (c84c413, 2026-11-05): the two-column layout, the spinner, the Markdown view and the shared image dialog are unverified. The Markdown view renders the model's text with `MarkdownContent` (no raw HTML), so how the two models' output looks there is unchecked. Code-read; steps in `manual-checklist.md`.

## Playground selector and downloads (31a9e7c, 2026-11-05; code-read and unit tests written, not run in the app)
- The header selector, the drawer's Playground downloads and the Playground tab on Installed models have not been run in the app. Steps: `manual-checklist.md`.
- A cancelled download reads "Paused" in the drawer for every kind. For a GenieX install cancelled during its silent setup, the label is wrong while the setup runs (see the GenieX section below).
- The Local models page's Playground list reads four catalogs on mount and shows a failed read as a banner with no Try again (`usePlaygroundLocalModels.ts`); the popover's failed catalog does have a retry.

## Image upscaling and Image to image redesign (2026-11-05; code-read, not run in the app)
- The new cards (one stage plus controls, Compare, Clear, the info icons; Image to image also the size popover and Advanced settings) are not run. Steps: `manual-checklist.md`, sections "Playground: Image upscaling redesign" and "Playground: Image to image redesign". The committed tabs before this were run by the user (see "Runtime status of the Playground").
- The input picture is read twice while a result for it shows: the hidden `InputImagePreview` in `PictureStage` and `useResultStage` each call `readInputImage`. Code-read; not measured.
- The hidden input preview still mounts and loads, so its `onLoad` reports the picture size. Assumed to work in WebView2; not checked.
- Clear returns to the first step and keeps the result in the store (`clearInputImage`, `clearUpscaleInput`). Picking the same file again brings the saved result back (code-read).
- Image to image: Advanced settings is unmounted while a job runs (its settings are hidden then), so it closes after each job (code-read).
- Image to image: the size popover has no disabled state, so it can be changed during a job. The job keeps the size it started with (`startEdit` builds the request when it starts; code-read).
- Locked fields (CFG on a fixed-CFG model, negative prompt on a model without one) show their reason in a tooltip on a span (`LockedTooltip`), because a disabled control does not react to the pointer. Hover in WebView2 is not checked.
- Unchecked: the controls row and the stage at narrow widths, Compare at the large size in dark and light themes, the hover and focus tooltips on a blocked Generate or Upscale button (`BlockedReasonButton`, `disabledFocusable`), the Advanced grid alignment, Compare and enlarge on an edit result, Clear and "Use this image as input", and the upscale empty state.

## Text to image redesign, tab reset and rail (2026-11-05; code-read, not run in the app)
- The text to image card (picture stage, prompt and settings, controls) is not run. Steps: `manual-checklist.md`, section "Playground: Text to image redesign, tab reset and the rail". The text tab was run by the user before this change (see "Runtime status of the Playground").
- Advanced settings closes after each text to image job: the form is not rendered while a job runs (`TextToImagePanel`), as on Image to image. Expected from code.
- A new job clears the previous result in the store (`startJob`), so after a cancel or a failure no earlier text picture shows. Expected from code.
- The size button stays usable during a job; the job keeps the size it started with, because the request is built when Generate is pressed (code-read).
- Tab reset: `usePlaygroundTabReset` runs from effects. `PlaygroundSectionPage` has one route element per tool with no key, so React is expected to keep one instance across tools (the reset then runs from the tool-change effect). Not checked in the app; the Audio tool's reset depends on it too.
- Tab reset tests cover the store actions and the tables (`stores/playgroundReset.test.ts`, `utils/playgroundReset.test.ts`). The hook itself (effect order, StrictMode, leaving to Chat and back) has no test.
- A running job is not stopped. Its input (image, OCR picture) is kept, and the Audio tool keeps its inputs and results while a job runs (`resetAudioWork` does nothing then).
- Sidebar rail (`Sidebar.css`, `Sidebar.tsx`): the tabs are stretched and the `TabList` is keyed by `collapsed`. Whether the icons centre and the indicator follows the page after each toggle is not checked in the app.

## Audio tool (2026-11-05 merge; the user tested it and reports it works as intended; the items below were not run)
- Not run: a speech model download with no connection (the GitHub offline text; see "Playground selector and downloads" for the shared drawer text), and voice cloning (see "Playground and optional runtimes"). Steps: `manual-checklist.md`, "Playground: Audio tool".
- A WAV over 10 MB: the file picker accepts any .wav (`useAudioFilePicker`), but the input preview reads the clip with `readInputAudio` -> `readAttachment`, which refuses files over `MAX_MEDIA_FILE_BYTES` (10 MB). The preview then shows an error. Whether the job still runs on such a file was not checked.
- Long clips: the input and output waveform decodes the whole clip in the webview (`decodeWaveform`, `AudioContext.decodeAudioData`) and draws up to 1200 bars. The decode time and the page's responsiveness for a long clip are not measured.
- The waveform decode can fail (the webview cannot decode the file): the player shows a banner and the webview's own controls (code-read; no case reported).
- No live waveform while recording, by design: the clip appears after Stop.

## GenieX CLI as a runtime (986b5dc; code-read, not run)
- Install, update and uninstall of the GenieX CLI have not been run in the app. Steps: `manual-checklist.md`. The silent flags, the `unins000.exe` name (Inno Setup's default, assumed by `runtimes/geniex.rs`) and the version poll are not checked against a real install.
- Cancel during `installing` only stops the wait. The drawer shows the entry cancelled, but the silent setup keeps running. The operation lock is released then, so Resume can start a second setup while the first may still run, and Uninstall can run beside it (code-read).
- A retry downloads the setup again: a failed or cancelled install's setup file is not reused (only a `.part` is resumed). The comment in `runtimes/geniex.rs` says otherwise.
- Uninstall stops only the server this app started (its tracked PID). A GenieX server started outside the app keeps running (code-read, `stop_tracked_server`).
- "Check again" on a runtime that is not installed re-reads the list only. GitHub is checked at startup, when the list changes, and every 6 hours while the app is open (f1e5543, `RuntimeUpdateRuntime`), so a stale "Latest" version can stay up to 6 hours after a new release (code-read, `runtimeStore.ts`).
- Feature locks: the CLI state is unknown (null) until the first read, so nothing is locked before it; a failed read keeps the last known state (`runtimeStore.ts`, `runtimeGuards.ts`).

## Qualcomm AI Hub tab (committed 7664d01..55219bc; code-read 2026-10-28, runtime-unverified)
- Reported on 2026-10-28 (not re-run here): runtime 11 (QAIRT Genie bundles: `genie_config.json` plus `ctx-bins`) and runtime 12 (llama.cpp GGUF) load in GenieX. Runtime 6 (Genie bundle) failed to load because it had no `metadata.json`; runtimes 2 (QNN DLC) and 3 (QNN context binary) failed on import or load. Runtimes 2, 3 and 6 are not listed in the tab now (see `codebase-map.md`). The `metadata.json` requirement matches GenieX's `localfs` zip reader (`sdk/model-manager/crates/core/src/source/localfs.rs`, read-only checkout `C:\Work\GenieX`).
- The catalog, detail, model card, download and import were not run in the app or against the live bucket. The version probe (`resolve_version`) relies on the bucket answering 403 for a missing object, which is stated in a code comment and not checked.
- The detail page lists the assets of every chipset and does not filter by the device; the asset picker shows a `This device` / `Other chipset` badge and disables Download for another chipset. The backend refuses it too ("This AI Hub asset is for X, and this device is Y"). An unset GenieX `chipset` allows only universal assets.
- Chipset matching normalises names (AI Hub `qualcomm-snapdragon-x-elite` against GenieX's `Snapdragon X Elite CRD`). Not run against a live device report.
- The download gate is in memory: a zip can be downloaded only after its model page was opened in the same session (`AihubCache.asset_urls`). After a restart, open the page first.
- `geniex pull qualcomm/<Name>:<precision> --model-hub localfs --local-path <zip>` is the import path for runtime 11; the precision label is taken from the app (`validate_precision`), and whether GenieX accepts the label for a zip was not verified.
- The AI Hub card's fallback line `QAIRT · N chipsets` (`aihubCardData`) shows only when the model's info file cannot be read, so a GGUF-only model in that case is still labelled QAIRT (code-read). With the info file, the card shows the model's own facts instead.

## Model cards and detail pages (c6f6bea; code-read; the user looked at the layout on 2026-11-04, "okay for now")
- Hugging Face capability icons are guesses from the Hub's tags and the GGUF chat template (`utils/hubCapabilities.ts`). The `tools` and `reasoning` words can match text that is not a tool or thinking mode. The icon and the detail line say "inferred". Not checked against real models.
- Card RAM verdicts rest on fixed numbers: 8.5 bits per weight for 8-bit, 4.85 for 4-bit, and 1.15 times the file size for AI Hub's Model Size (`utils/cardRam.ts`). Not checked against measured memory. A GGUF repo's parameter count is approximate and the card says "estimate".
- The AI Hub list waits for every kept model's info file on first load (`aihub_list_models`, 8 at a time). The first-load time is not measured. A model whose info file cannot be read is listed without card facts.
- The Hugging Face detail page assumes the second `expand[]` request returns the fields the plain response lacks. Not checked against the live Hub. If that request fails, `downloadsAllTime` and `childrenModelCount` are missing and the rest of the page still shows.
- The installed model card shows RAM and context from its stored row. A row from before the RAM and context columns shows what it has; not checked against an old row.

## Chat attachments (code-verified, runtime-unverified)
- mp3 input is not verified with the server. The chat path sends `input_audio` with `format` `mp3` when the file is an mp3; GenieX accepts the format name and writes a temp file (code-read). The audio scan probe uses wav, so wav is the only format the scan has exercised.
- A message saved before paths were kept (a ref with no `path`) has no Retry button, and every send in its session warns "Files not sent" and leaves that file out, because the history is rebuilt from all messages. The warning repeats on each send until that message is deleted (Delete on the bubble, with every later message; `MessageBubble.tsx` `removeFrom`). The model does not see the file in the meantime (code-read; not run).
- A stored file that was moved or deleted is left out of every later send and Retry in its session the same way: the send goes ahead, a "Files not sent" toast names it, and the toast repeats until its message is deleted. Its tile shows "no longer at its path" when opened.
- Text files are re-read from disk on every later turn. The first send uses the copy read at attach time, so an edit made after that changes what the model gets from the next turn on.
- Context total (rewritten in 71d05a4, 2026-11-02, `utils/contextUsage.ts`): an estimate only. A reply counts its `completionTokens` when it has them; every other message counts its text at characters / 4; text files are added at characters / 4. Images and audio are not counted. The server's `prompt_tokens` is not used, because it covers only the tokens processed for that request (KV reuse), so the total can sit far below the real context. Not measured against the server's real context size.
- The usage stream is unverified in a live run. GenieX sends the usage chunk when `include_usage` is set (code-read). A stopped reply has no counts and is estimated from its text.
- Images above 1536 px on the long edge are re-encoded as JPEG (quality 85) before sending. The effect of that on answers is not tested.
- Vision and audio are gated by a `works` scan result for the active model. A file of a kind the active model cannot take, anywhere in the session, blocks the send (`modelTakesFiles`), so switching to a model without the scan result blocks the old files too.
- Limits (code-verified in `commands/attachments.rs`, `utils/attachments.ts`): 4 files per message, 10 MB for image and audio, 512 KB UTF-8 for text. The "Open location" action is Windows only.
- Earlier cache overwrite (a second quant of the same repo replaced the first in the cache) was not reproduced in isolation. The observed loss was explained by a manual removal (reported). Treat as unconfirmed.

## Conversation compaction (committed 1116bf1)
- The main flow was tested by the user on 2026-11-02 (per the header of `manual-checklist.md`, section "Conversation compaction"); the remaining checklist items are not ticked.
- The trigger and the summary budget use the same character estimate as the context total, so a summary can come earlier or later than the real window would need. An unknown window disables the trigger and the splitting (code-read).
- The summary is the model's own text. The code checks only that it is not empty; nothing checks it against the conversation. A weak summary stays in effect until a later summary folds it in; summaries also stay in effect when the setting is off.
- Covered messages cannot be deleted or retried. This is enforced in the store and the UI; the summary row itself also cannot be removed.

## Sidebar usage chart with Playground jobs (committed 9a18c4f; code-read, partly run)
- Only the text to image and OCR lines were confirmed in the app by the user (2026-11-03). Upscaling, speech, image to image on a GPU or NPU device, and Auto on a device with no NPU counter are not checked.
- Text to image with Auto plots all three targets: the runtime's device choice is not reported to the frontend (code-read), so the chart cannot show which one it used.
- A GPU or NPU line depends on the engine counters in `get_system_usage`; on a device without them the line is left out (code-read, not run on that hardware).

## Navigation redesign (committed 24528c2; the user approved it in the app on 2026-11-04/05; items not run are in `manual-checklist.md`)
- The app uses a `MemoryRouter`, so a breadcrumb or sidebar click leaves a page without a "save first" check. Unsaved edits on a benchmark prompt or suite item page are lost when the user leaves that way. Known limit, not a blocker (user decision).
- The sidebar is expanded until the saved `sidebar_collapsed` preference is read at startup (`AppBootstrap`); a failed read keeps it expanded (code-read).

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
- `cli.rs`: timeouts and retry counts are magic numbers (move to `constants.rs`).
- `load_sessions` (`database.rs`) matches messages with a nested `find` and loads every session at startup. `list_downloaded_models` returns the full `model_card` text the grid does not need.
- Migration `m20261020_000001` (`add_repo_columns`) ignores every `ALTER TABLE` error. `delete_session` runs two statements without a transaction.
- Tauri calls outside `services/`: `AihubModelDetail` imports `open` from `@tauri-apps/plugin-shell` directly. `HubModelDetail` now uses `openExternal` (27e98d1).
- Chat streaming cost: `updateLastAssistantMessage` still rebuilds the message and `contextChars` on each flush. Chunks are written once per animation frame (`useChatStream.ts`, committed in 1b5d554), so the rate is lower; the rebuild itself is unchanged (code-verified).
- `DEFAULT_BASE_URL` duplicates `DEFAULT_PORT` in `constants.rs`. `package.json` has an `allowScripts` field, which is not a standard npm field.

## Operational notes
- No per-model unload endpoint in the GenieX CLI; stopping the server is the only unload.
- The port is configurable and persisted in `user_preferences` (default `18181`).
- The tracked PID is cleared when the `geniex serve` child exits, so a crashed server can be started again (code-verified in the `server.rs` exit watcher; runtime-unverified).

## Offline mode (27e98d1, 2026-11-04; code-read and unit tests written, not run offline in the app)
- A network drop partway through the AI Hub probe set can cache a lower catalog version for the session: `resolve_version` keeps the highest probe that answered, and a partial set may not include the newest release. A restart clears it (code-read).
- The offline classifier wins whenever `navigator.onLine` is false, so a local failure (for example a GGUF import) shown while the browser reports offline reads "You appear to be offline. Check your connection and try again." The raw error stays in the drawer entry's title attribute (`utils/networkError.ts`, `DownloadItemCard`).
- `aihub_list_models` drops a card-info read error (`list_model`: `card_info(...).ok()`). A network drop during those reads lists the models without card facts and shows no error. Those rows are not cached, so the next open reads them again (code-read).
- The 30 s Hub timeout (`hubFetch`) and the AI Hub timeouts (`AIHUB_TIMEOUT_SECS` = 60, probes 5 s) are not measured on a slow link.
- Nothing in this mode has been run in the app; the steps are in `manual-checklist.md` ("Offline mode").

## Runtime update notifications (f1e5543, 2026-11-04; a test notification was shown in the app; the real trigger is not run)
- **Clicks are not handled.** The notification has no click action. The body says "Open Settings > Runtimes to update." (`utils/runtimeUpdateNotice.ts`).
- **Permission:** `requestPermission` does nothing on Windows (reported by the user, 2026-11-04), so the send depends on the permission state the webview already has.
- **Delivery is not confirmed.** `sendNotification` in `@tauri-apps/plugin-notification` 2.4.0 (`dist-js/index.js`) is a plain web `Notification` call that is not awaited and reports no failure. `notify` resolves true after any call that does not throw, and the versions are recorded then. A toast that Windows does not show (for example under Focus assist) is therefore never retried for that version (code-read inference; not run).
- **App name in the toast (open).** The test toast under `tauri dev` read "Windows PowerShell" (user-observed). The reason given for that (the plugin sets the AppUserModelID only outside `target\debug|release`) is in the plugin's Rust `show()` (`src/desktop.rs`, 2.4.0), which the JS path does not call, so that rule does not explain the name (code-read). What an installed build shows is not checked. If Windows shows the raw identifier `com.localgenie.app` or another name, the fallback is to register the AppUserModelID `DisplayName` under `HKCU\Software\Classes\AppUserModelId\com.localgenie.app` at startup (not built; it would also change `tauri dev`).
- **A failed periodic check hides the hint.** `runtimeStore.checkUpdate` removes the runtime's update entry when a check fails (existing behaviour), so Settings drops the "update available" hint until a later check succeeds. No notice is sent for that runtime in the meantime.

## Download auto-retry (2026-11-06; code-read and unit tests written; Resume, the projector retry and the badge tested in the app by the user)
- Not run: the reconnect toast, the one-second spacing between reconnect retries and the 5/15/45 s backoff in the app. Steps: `manual-checklist.md`.
- A failure with a 404 or 403 is never retried, and a disk-full or other local error is not either (`isAutoRetryEligible`: offline and timeout only).

## Playground catalog growth (2026-11-07 working tree; code-read; the user ran and approved FLUX.2 klein 9B, Z-Image base, SenseVoice, Parakeet, Supertonic, DPDFNet and GLM-OCR; the rest not run)
- Piper, Matcha and Kitten may not phonemise correctly: the installed sherpa-onnx 2.0.1 marks `--vits-data-dir`, `--matcha-data-dir` and `--kitten-data-dir` as ignored (espeak-ng is no longer used).
- Moonshine tiny file names are inferred, not checked against the release. Multilingual Whisper gets no language flag.
- SDXL base may need the sdxl-vae-fp16-fix VAE. sd-cli loading of the Turbo GGUFs and of the upscaler .pth files is unverified.
- Voice licences are unclear (Lessac research dataset, GLaDOS Valve, Matcha weights). FLUX.2 klein 4B uses the FLUX.2-dev VAE; its licence is not checked.
- No RAM warning for the 10 GB image models.
- An OCR page cut at the output cap shows no notice (`finish_reason` is ignored).
- The GLM-OCR HTML-to-Markdown table converter is built from hand-written HTML, not from captured GLM-OCR output.
- The Matcha size on its row is the archive only, and a failed vocoder download redownloads the archive.
- Models landing no longer needs the GenieX CLI; its needs moved to the three GenieX sub-pages.
- `AihubModelDetail`'s README does not resolve relative image URLs yet.

## Installer and uninstall (phase 1; the user tested a debug installer on 2026-11-07, see `manual-checklist.md`)
- Not tested: the NSIS uninstaller's checkbox label, silent uninstall (`/S`), an update-mode install (`/UPDATE` skips cleanup), the GenieX setup-file sweep (no real update run), the Storage "Open folder" button, the rename of an existing `geniex.db` on real data, and a release (non-debug) installer after the nonce fix.
- `English.nsh` was copied from Tauri's dev branch and may drift from the bundler's pinned version.
- The GenieX Inno silent flags are assumed; the uninstall worked on the user's machine, the install path was not tested again.
- GenieX CLI config outside its install and model cache folders is not checked by the cleanup.
- Authenticode signing is skipped, so Windows SmartScreen warns on the installer.
- Updater and release pipeline: see the next section.

## App updater and release pipeline (2026-11-10; the local update test passed, the rest not run)
- The two GitHub workflows (`ci.yml`, `release.yml`) have never run. Unconfirmed: the `windows-11-arm` runner label, the `tauri-apps/tauri-action@v0` inputs and the two repository secrets (see `release.md`). The first tag push is the test.
- The release notes are a placeholder (`releaseBody` in `release.yml`); the draft must be edited before it is published.
- Only the local feed was tested. The GitHub feed (`latest.json` of the latest published release) and an update from a published release are not run.
- Not run in the app: the running-work list in the Install confirm (`AppUpdateCard`, `useRunningWork`; the line text is unit-tested) and the desktop notice for a new app version (`useAppUpdate`). The notice has no click action, the same limit as the runtime notice.
- The updater cannot be switched off: the plugin is registered and `plugins.updater` is set in every desktop build (code-read). A Microsoft Store build would need a config change.
- Relaunch after install is best effort: on Windows the installer closes the app when it starts (`services/appUpdate.ts`).
- Migrations are forward-only, so an older build cannot be restored over a newer database. Plan decision; the release notes must say so. Not built.

## Resolved (code-verified; runtime-unverified)
- Download auto-retry gaps (2026-11-06; the user tested both in the app and says they work): a GGUF projector (sidecar) network failure (offline or timeout) was toasted and skipped, so the model imported without it. It now fails the entry, which retries by itself and resumes from `.part`; other projector failures are still skipped with the toast (`runGGUFDownload`, `downloadPipeline.ts`). The drawer badge read "Error" during a wait or a countdown; it reads "Retrying soon" (`DownloadStatusBadge` `retrying`, passed by `DownloadItemCard`).
- Safari fetch failure "Load failed" was matched as a plain fragment, so "Download failed with status 404" (a Hugging Face or AI Hub HTTP error) read as offline and showed the offline text. It is now a word-start match (`LOAD_FAILED` in `utils/networkError.ts`), with unit tests `classifyFailureText` in `networkError.test.ts` (2026-11-06 working tree; code-verified by those tests, not run in the app).

- `ResultPictureView` split the file name on `/` only, so a Windows path showed its folder in the title. It now uses `inputFileName` (`utils/imageToImage.ts`, which splits on both separators; code-verified 2026-11-05, not run).
- The upscale comparison's source comments said there was a height cap, but the code has none. `ImageCompare.css` now says there is none, and `UpscaleResult.css` is deleted with the redesign (`ResultPictureView`, `ImageCompare`; code-verified 2026-11-05, not run).
- Local page Hugging Face search always returned no results: `search_models` did not ask for `siblings`, and `gguf_models` keeps only models whose file list has a `.gguf`, so every result was dropped. `commands/hub.rs` `search_url` now sends `expand[]=siblings`, and `gguf_models` has a unit test (27e98d1; code-verified, not run in the app).
- `search_models` parsed the response body before checking the HTTP status. The status is checked first in `commands/hub.rs` (code-verified, not run).
- The GenieX installer is checked against GitHub's SHA-256 digest before it runs (`runtimes/geniex.rs`, `verify_download`). The old `update_geniex` ran the downloaded installer unchecked, and that command is removed (986b5dc; code-read, not run). A check is skipped when GitHub gives no digest.
- The release fetch duplicated between the CLI check and update is gone with `cli_update.rs` (both now use `runtimes/release.rs`). The comment calling `UpdateInfo` a re-export is gone too: no such comment exists at c051c2a, and the type is removed (986b5dc).
- Typed numbers in Fluent SpinButton fields were lost: a typed value arrives only as `displayValue`. `utils/spinValue.ts` (`spinNumber`) reads both; used by the model settings, image settings, suite editor and server runtime card (71d05a4; tested by the user 2026-11-02).
- Context usage showed the server's `prompt_tokens`, which counts only the tokens processed for the request. It is now the per-message estimate described under Chat attachments (71d05a4; compaction and the ring tested by the user 2026-11-02).
- `HubModelDetail` and the AI Hub asset picker loaded the downloaded precisions once per repo, so "Load & Chat" and the Download button did not update until the page was reopened after an import. `useDownloadedPrecisions` re-reads when the local model list changes, and `AihubAssetPicker` disables Download with a `Downloaded` badge for an asset already imported (bbe159f; tested by the user 2026-11-03).
- Chat auto-scroll pulled the view down while the user read older text. It follows the stream only within 48 px of the bottom (`utils/scroll.ts`, used by `ChatArea` and `ThinkingBlock`; bbe159f; tested by the user 2026-11-03, a little jitter remains).
- Models always loaded on CPU for a model whose saved settings held `compute = cpu`: the per-model compute setting beat the header choice, and re-selecting a loaded model skipped the load. The setting is removed (migration `m20261037`), the header choice decides every load, and a loaded model reloads when the target changes (`loadedOnOtherCompute`; bbe159f; tested by the user 2026-11-03).
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
- The `install_geniex` stub is removed.
- Header model selector is wired to `ModelSelectorPopover` (`Header/ChatModelSelector/`, picked by `Header/Header.tsx`), with loading and errors in `Header/useModelLoader.ts`.
- Earlier, from git history: session persistence upsert fix, installer-based CLI update flow and update UI rework (see `cli-update.md`).
