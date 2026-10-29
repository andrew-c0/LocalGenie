# LocalGenie project overview

## What it is
LocalGenie is a Tauri 2 desktop client for Qualcomm GenieX local inference. It wraps a local GenieX server and gives users a desktop UI for downloading GGUF models from Hugging Face, importing them into GenieX, starting a server, loading models, and chatting with them. Architecture and file-level facts are in `codebase-map.md`.

## Stack
- Frontend: React 19, TypeScript, Fluent UI v9, Zustand
- Backend: Rust + Tauri 2
- Persistence: SQLite via sea-orm
- Runtime: local GenieX CLI process with an OpenAI-compatible HTTP API
- Optional runtimes for the Playground, installed from Settings > Runtimes: stable-diffusion.cpp (`sd-cli`, images) and sherpa-onnx (speech to text and text to speech)

## Core flow
1. User downloads a GGUF model from Hugging Face in the app (resumable; drawer shows progress, cancel, resume).
2. The app imports the file into GenieX (`geniex pull ... --model-hub localfs`) and records it in `downloaded_models`.
3. User starts the local GenieX server and loads a model.
4. User chats with streaming responses, and can attach images, audio clips and text files to a message (media needs a confirmed scan result for the model).
5. Sessions and settings are persisted locally.
6. CLI updates: a badge on the sidebar settings button; the update runs from the App Settings drawer (installer download, launch, version polling).

## Current state (2026-10-29)
- Committed 42dea0c to 0e0dcb5 (2026-10-29, not run): the optional runtimes framework (install, update check, uninstall from GitHub releases) and Settings > Runtimes. The stable-diffusion.cpp runtime points at the fork's ARM64 releases. See `codebase-map.md`.
- Committed in 2122ed2: Hugging Face facets in the model browser and on model pages (task, size, library, licence, base model, quantisation), stored with each download; and a think-token path for chat templates that read `<|think|>`.
- Committed 7664d01 to 55219bc (2026-10-28, not run): the Qualcomm AI Hub tab (read-only catalog, model detail with a per-asset picker, zip import for runtime 11, GGUF download for runtime 12), the Hugging Face browser without its Qualcomm area, the `capability_scan/` folder and the `ModelSettings/sections/` split. See `codebase-map.md`.
- Committed up to 961d167: per-conversation settings (`ChatSettingsDrawer`, `chat_sessions.settings_overrides`), model and compute change lines in the chat, a per-repo download folder (projector and model are downloaded into it, then imported; `delete_directory` removed), and run step replies in the Runs tab. Earlier, at 63f1fbc (benchmark suite: Benchmarks area with prompt library, suites, a Rust-run benchmark over the loaded model, saved runs and compare charts; earlier: model capability scan and selector badges, sidecar downloads before import, loaded-model list from `/status`, system usage card, chat attachments (image, audio, text), exact per-reply token counts, deleting a message with the ones after it, chat welcome view, conversation pinning). The working tree was clean at the last sync. See `codebase-map.md` for the exact state.
- Model loading and chat completion still carry the GenieX warmup/server response risk (`known-issues.md`).
- Benchmarks (`/benchmarks`) run suites through the Rust runner. Compute and power recording are not yet checked against a live model (`known-issues.md`).
- Playground (`/playground`): text to image (committed 1dd3cf8) with three curated models run by `sd-cli`, downloads, delete, compute choice and a Pictures output folder; GPU has a known white-image bug and is slower than the CPU (`known-issues.md`). Image to image (uncommitted: SD 1.5 re-draw, FLUX.2 klein edit; Video is the only disabled tab). Speech to text (Whisper tiny.en, Moonshine base; .wav file or microphone) and Text to speech (Kokoro, English voices) through sherpa-onnx, CPU only, output in `Music\LocalGenie`. Not run in the app. The research and plan are in `memories/research/`.
- Qualcomm AI Hub: catalog, asset picker, zip import (runtime 11) and GGUF download (runtime 12) are in (committed; runtime-unverified); `list_aihub_models` is legacy and unused.
- Legacy `geniex` naming is kept where the external CLI requires it.
- Unit tests exist (vitest, Rust `#[cfg(test)]`); no UI tests. `tasks.md` holds the backlog.
