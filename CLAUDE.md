# LocalGenie

Tauri 2 desktop UI (React 19 + TS frontend in `src/`, Rust backend in `src-tauri/`) for Qualcomm's GenieX CLI, which runs local LLMs on CPU/GPU/NPU. Models are downloaded directly from Hugging Face (GGUF) by the app, then imported through GenieX's local import (`--model-hub localfs`), not hub-pulled; leftover Qualcomm AI Hub code is legacy and will be reworked later. Project is a work in progress.

## Read first
- `memories/repo/codebase-map.md` - architecture, commands, events, DB, flows (start here)
- `.github/github-instructions.md` - original repo rules (user-owned; `.claude/` copies below are the working versions)
- `.github/geniex-cli-reference.md` - full `geniex` CLI flags
- `memories/repo/known-issues.md`, `cli-update.md`, `db-architecture.md`, `manual-checklist.md`; copies in `docs/memories/`

## Agents and routing
Working agents: `.claude/agents/` (`rust-expert`, `react-expert`, `geniex-specialist`, `repo-default`, `knowledge-sync`). Skills: `.claude/skills/rust-quality`, `.claude/skills/typescript-react-quality`.
- Work under `src-tauri/` goes to `rust-expert`. Work under `src/` goes to `react-expert`. CLI, `geniex` or server behaviour goes to `geniex-specialist`.
- A change that crosses `src/` and `src-tauri/` (an IPC contract change) goes to `repo-default`, which splits it between the specialists.
- Docs sync goes to `knowledge-sync`.
- For a change in one area, delegate to that agent. Do not hand back a change that spans both halves without saying so.
- `memories/external/` - HF Hub OpenAPI and GGUF spec; large, read on demand only
- `tasks.md` - current backlog

## Commands
`npm run dev` (tauri dev) - `npm run check` (tsc) - `npm run lint` (biome) - `cargo check` / `cargo clippy` in `src-tauri/` - `npm run build`.

## Essentials
- `invoke()` only in `src/services/`; routes only in `src/Navigation.tsx`; `App.tsx` stays scaffolding.
- Rust commands return `Result<T, String>`, no panics; one domain per module; never edit applied migrations.
- Changing a `#[tauri::command]` signature is an IPC contract change: update `src/services/*`.
- Model load/chat has a known warmup-hang risk; validate that path, don't assume it is fixed.
- Keep docs short; don't duplicate facts across files.

## Keeping knowledge current
After new commits, run the `knowledge-sync` agent (`.claude/agents/knowledge-sync.md`). It reads git history since `.claude/knowledge-sync.state` and updates the codebase map and notes.
