# LocalGenie project overview

## What it is
LocalGenie is a Tauri 2 desktop client for Qualcomm GenieX local inference. It wraps a local GenieX server and gives users a desktop UI for browsing models, starting a server, loading models, and chatting with them.

## Stack
- Frontend: React 19, TypeScript, Fluent UI v9, Zustand
- Backend: Rust + Tauri 2
- Persistence: SQLite via sea-orm
- Runtime: local GenieX CLI process with an OpenAI-compatible HTTP API

## Core flow
1. User starts or configures the local GenieX server.
2. User browses available models and pulls/removes them.
3. User loads a model through the server.
4. User chats with streaming responses.
5. Session and settings data are persisted locally.
6. User is notified of GenieX CLI updates via a badge on the sidebar settings button; updates run through the App Settings drawer (installer download + launch + version polling).

## Current state
- Most app shell and session flows work.
- Model loading and chat completion are currently blocked by the GenieX warmup/server response issue.
- The server port defaults to `18181` and is stored in `user_preferences`.
- Legacy `geniex` naming is still used where required by the external CLI.
- CLI update flow is installer-based (GitHub releases → app data dir → launch → poll); see `cli-update.md` and `manual-checklist.md`.
