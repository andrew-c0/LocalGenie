# LocalGenie repository instructions

## Product
- LocalGenie is a Tauri 2 desktop app for running local models with the Qualcomm GenieX CLI.
- Stack: Tauri 2 + React 19 + TypeScript + Fluent UI v9 + Zustand + SQLite via sea-orm.
- Frontend code lives in `src/`; Rust/Tauri code lives in `src-tauri/src/`.

## Default coding rules
- Prefer surgical, minimal changes over broad rewrites.
- Keep one responsibility per file and one domain per Rust command module.
- Use `src/services/` as the only place for Tauri `invoke()` wrappers.
- Keep Zustand stores domain-scoped; compute derived state instead of syncing it in effects.
- No direct `invoke()` calls from UI components.
- Use CSS classes instead of inline styles; keep shared tokens in `src/App.css` or theme files.
- TypeScript: strict mode, no `any`, prefer `import type`, no unused vars/params.
- Rust: no panic in handlers; return `Result<T, String>` and surface errors cleanly.

## Current project reality
- App shell, chat history, model browser, server lifecycle, and settings are functional.
- Known blocker: model loading and chat completion hang when the GenieX server does not respond to the warmup request.
- This is the highest-priority issue to validate whenever changing the model/server flow.
- Default server port is `18181`; it is persisted in the `user_preferences` table.
- The product name is `LocalGenie`; underlying CLI and legacy references remain `geniex` where required.

## Key paths
- Frontend: `src/components/`, `src/services/`, `src/stores/`, `src/types/`
- Rust backend: `src-tauri/src/commands/`, `src-tauri/src/entities/`, `src-tauri/src/migrations/`
- Database: SQLite with sea-orm migrations; startup runs pending migrations automatically.

## Agent routing
Delegate work to specialized agents based on the task:
- **React Expert** — use when the user mentions `react`, `frontend`, `ui`, `component`, `hook`, `store`, `styling`, or any UI-related work. Owns everything under `src/` (excluding `src-tauri/`).
- **Rust Expert** — use when the user mentions `rust`, `backend`, `cli`, `tauri`, `command`, `migration`, `database`, `download`, or similar. Owns everything under `src-tauri/`.
- Cross-boundary changes (e.g., a new Tauri command consumed by the UI) should be coordinated: the owning agent implements, and the IPC contract change is flagged to the other agent.

## Avoid token bloat
- Keep new instructions short, factual, and project-specific.
- Do not duplicate architecture, status, or issue notes across multiple files.
- Prefer one source of truth and brief references instead of long repeating narratives.
