# CLI update feature

## Status
- CLI update checks exist in the Rust backend and frontend service layer.
- Update flow is installer-based: `geniex update` CLI command was found unreliable and was replaced.

## Backend — `src-tauri/src/commands/cli.rs`
- `check_for_cli_update()` → queries GitHub API (`/repos/qualcomm/GenieX/releases/latest`), compares installed version via `version_less_than()`, returns `UpdateInfo { current_version, latest_version, update_available, release_url }`.
- `update_geniex(app)` → full installer flow:
  1. Fetch latest release JSON from GitHub API.
  2. `find_arm64_installer()` matches asset containing `cli-setup` + `windows-arm64` + `.exe` (e.g. `geniex-cli-setup-windows-arm64-v0.5.0.exe`).
  3. `download_installer()` saves it to `app.path().app_data_dir()` (requires `use tauri::Manager` for `.path()` on AppHandle).
  4. `launch_installer()` spawns the downloaded `.exe` directly so the user completes setup.
  5. Polls installed version every 3s for up to 5 minutes (100 attempts); success when version matches latest, timeout error otherwise.
- Progress emitted as `geniex-update-progress` events with `{ message }` payload; `emit` closure takes `String` (pass `.to_string()` for literals).
- Version parsing: `get_installed_version_timeout()` runs `geniex version`, parses first dotted token.

## Frontend
- `App.tsx` calls `checkForCliUpdate()` on init → stores in modelStore as `updateInfo`.
- `Sidebar.tsx`: settings button moved to sidebar header next to logo (icon-only, auto-width); shows a small red dot badge when `updateInfo.update_available`.
- `AppSettings.tsx` (settings drawer): CLI update card; `handleUpdate()` calls `updateGeniex()`, listens for progress events, then re-checks and calls `setUpdateInfo(info)` to refresh the store (NOT `setUpdateInfo(null)` — that caused a stuck "Checking for updates…" state).

## Notes
- Platform-gated to Windows ARM64 (`platform_supported()`).
- `resolve_geniex_executable()` prefers local install root (APPDATA\geniex-cli), then PATH.
- Installer downloads into the app data dir — see `manual-checklist.md` for post-build verification.
