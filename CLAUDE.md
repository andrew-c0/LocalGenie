# LocalGenie

Tauri 2 desktop UI (React 19 + TS frontend in `src/`, Rust backend in `src-tauri/`) for Qualcomm's GenieX CLI, which runs local LLMs on CPU/GPU/NPU. Models are downloaded directly by the app (Hugging Face GGUF, and Qualcomm AI Hub QAIRT zips from the public bucket), then imported through GenieX's local import (`--model-hub localfs`), not hub-pulled. The AI Hub tab is a read-only catalog plus zip import; the legacy `list_aihub_models` command is unused. Project is a work in progress.

## Read first
- `memories/repo/codebase-map.md` - architecture, commands, events, DB, flows (start here)
- `memories/geniex-cli-reference.md` - full `geniex` CLI flags (kept as written; updated when the CLI changes)
- `memories/repo/` - the one source for repo knowledge and explanations of changes: `known-issues.md`, `cli-update.md`, `db-architecture.md`, `manual-checklist.md`, `code-quality.md`, `geniex-server-behaviour.md` (GenieX server facts LocalGenie depends on)
- Rules and agents live in `.claude/` (former `.github/` copies are in `.claude/archive/github/`, not loaded)

## Agents and routing
Working agents: `.claude/agents/` (`rust-expert`, `react-expert`, `geniex-specialist`, `repo-default`, `knowledge-sync`). Skills: `.claude/skills/rust-quality`, `.claude/skills/typescript-react-quality`.
- Work under `src-tauri/` goes to `rust-expert`. Work under `src/` goes to `react-expert`. CLI, `geniex` or server behaviour goes to `geniex-specialist`.
- A change that crosses `src/` and `src-tauri/` (an IPC contract change) goes to `repo-default`, which splits it between the specialists.
- Docs sync goes to `knowledge-sync`.
- For a change in one area, delegate to that agent. Do not hand back a change that spans both halves without saying so.
- `memories/external/` - HF Hub OpenAPI and GGUF spec; large, read on demand only
- `tasks.md` - current backlog

## Commands
`npm run dev` (tauri dev) - `npm run check` (tsc) - `npm run lint` (biome) - `npm test` (vitest) - `cargo check` / `cargo clippy` / `cargo test` in `src-tauri/` - `npm run build`.

## Essentials
- `invoke()` only in `src/services/`; routes only in `src/Navigation.tsx`; `App.tsx` stays scaffolding.
- Rust commands return `Result<T, String>`, no panics; one domain per module; never edit applied migrations.
- Changing a `#[tauri::command]` signature is an IPC contract change: update `src/services/*`.
- Model load/chat has a known warmup-hang risk; validate that path, don't assume it is fixed.
- Keep docs short; don't duplicate facts across files.

## Keeping knowledge current
After new commits, run the `knowledge-sync` agent (`.claude/agents/knowledge-sync.md`). It reads git history since `.claude/knowledge-sync.state` and updates the codebase map and notes.
