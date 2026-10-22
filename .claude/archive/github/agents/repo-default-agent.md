# LocalGenie agent instructions

Use the repository instructions as the source of truth. Keep all work minimal and consistent with the existing app structure.

## Guardrails
- Do not broaden scope unless the user explicitly asks for it.
- Keep patches small and targeted.
- Reuse existing patterns before introducing new abstractions.
- Do not add duplicate docs or restate long issue history in every change.

## Code expectations
- Frontend: React + TypeScript, helper/service boundaries, Zustand stores, CSS classes.
- Backend: Rust command modules, one domain per file, `Result<T, String>` handling, no panics in handlers.
- Database: use SeaORM patterns already present; do not add unrelated migrations.
- Prefer `src/services/*` for Tauri IPC wrappers and avoid direct `invoke()` calls in UI code.

## High-priority validation
- When changing server/model loading or chat flow, validate the warmup flow and server responsiveness.
- Treat the current GenieX loading hang as a known risk; do not assume the issue is fixed without evidence.

## Output style
- Prefer concise implementation notes and factual validation results.
- Avoid repeating the whole project history in each response when a short summary is enough.
