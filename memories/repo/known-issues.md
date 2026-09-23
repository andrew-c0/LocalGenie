# Known issues

## Active
- Model loading/chat completes hang because the GenieX warmup request never gets a response from the server.
- The app depends on successful model loading before normal chat interactions work.

## UI (Stitch conversion) follow-ups
- Header model-selector trigger is visual only — no popover is wired yet (old `ModelSelector` logic was deleted when converting to full-page views; needs a `ModelSelectorPopover` rebuild).
- Benchmark "Run Benchmark" button toggles a visual running state only — no backend benchmark command exists.
- Hardware telemetry (NPU/VRAM utilization, thermals, memory bandwidth, power) has no backend source; Overview/Benchmark pages show honest "unavailable" states. Adding it requires new Rust commands + Tauri events.
- Benchmark run history is in-memory only (`benchmarkStore`) — persistence would need a new table + commands.
- Legacy CSS sections (`.sidebar-*`, `.welcome-*`, `.model-browser-*`, `.main-header`) remain in `App.css` with no consuming components — safe to delete (~800 lines).
- Old purple/navy theme values in `src/theme.ts` were partially superseded by the `--lx-*` tokens in `App.css`; a full Fluent token realignment is pending.
- LocalGenie/NeuralStudio logo SVGs exist in `memories/ui/stitch_localgenie_design/` but are not yet bundled as app assets; `Sidebar` uses an inline simplified sparkle SVG.

## Operational notes
- No per-model unload endpoint exists in the GenieX CLI; server kill is the current fallback.
- The port is configurable and persisted in `user_preferences`.

## Resolved
- Session persistence bug was fixed by replacing unsafe `INSERT OR REPLACE` behavior with an upsert pattern that avoids wiping related messages.
- CLI update checks have been hardened to avoid retry loops and to treat the install step as success when output indicates readiness.
- `geniex update` CLI command proved unreliable (silent failures, stale binary after "success"). Replaced with an installer-based flow: download the Windows ARM64 setup `.exe` from GitHub releases into the app data dir, launch it for the user, then poll the installed version every 3s for up to 5 minutes. See `cli-update.md`.
- Update UI reworked: settings button moved to sidebar header (icon-only, auto-width) with a small red dot badge when an update is available; the update card lives inside the App Settings drawer. Fixed a stuck "Checking for updates…" state by refreshing the store via `setUpdateInfo(info)` instead of nulling it.
