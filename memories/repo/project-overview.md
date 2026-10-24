# LocalGenie project overview

## What it is
LocalGenie is a Tauri 2 desktop client for Qualcomm GenieX local inference. It wraps a local GenieX server and gives users a desktop UI for downloading GGUF models from Hugging Face, importing them into GenieX, starting a server, loading models, and chatting with them. Architecture and file-level facts are in `codebase-map.md`.

## Stack
- Frontend: React 19, TypeScript, Fluent UI v9, Zustand
- Backend: Rust + Tauri 2
- Persistence: SQLite via sea-orm
- Runtime: local GenieX CLI process with an OpenAI-compatible HTTP API

## Core flow
1. User downloads a GGUF model from Hugging Face in the app (resumable; drawer shows progress, cancel, resume).
2. The app imports the file into GenieX (`geniex pull ... --model-hub localfs`) and records it in `downloaded_models`.
3. User starts the local GenieX server and loads a model.
4. User chats with streaming responses, and can attach images, audio clips and text files to a message (media needs a confirmed scan result for the model).
5. Sessions and settings are persisted locally.
6. CLI updates: a badge on the sidebar settings button; the update runs from the App Settings drawer (installer download, launch, version polling).

## Current state (2026-10-25)
- Committed up to 694a036 (model capability scan and selector badges, sidecar downloads before import, loaded-model list from `/status`, system usage card, chat attachments (image, audio, text), exact per-reply token counts for the context total, the text-file arc of the context ring, deleting a message with the ones after it). The working tree holds uncommitted model-selector and header UI edits. See `codebase-map.md` for the exact state.
- Model loading and chat completion still carry the GenieX warmup/server response risk (`known-issues.md`).
- The Playground measures live streaming TTFT and throughput; the dashboard "Run Benchmark" is UI only (no benchmark backend).
- Qualcomm AI Hub code is legacy and will be reworked later.
- Legacy `geniex` naming is kept where the external CLI requires it.
- Unit tests exist (vitest, Rust `#[cfg(test)]`); no UI tests. `tasks.md` holds the backlog.
