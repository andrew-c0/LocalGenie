# CLI Update Check Feature

## Files involved
- `src-tauri/src/commands/cli.rs` — Rust backend (check_for_cli_update, update_geniex, get_installed_version)
- `src-tauri/src/lib.rs` — Handler registration in generate_handler![]
- `src/types/index.ts` — UpdateInfo interface
- `src/services/geniex.ts` — checkForCliUpdate(), updateGeniex() wrappers
- `src/stores/modelStore.ts` — updateInfo state + setter
- `src/App.tsx` — Boot check, passes updateInfo to Sidebar
- `src/components/Sidebar.tsx` — Notification banner + update button UI + handleUpdate logic
- `src/App.css` — .sidebar-notification* styles, .sidebar-divider

## Known issues
- `geniex update` exits with code 1 on Windows even when download succeeds (can't replace running binary)
- Rust code now treats "ready to install" in output as success regardless of exit code
- Frontend now dismisses banner after download + shows "restart to finish" toast (avoids retry loop)
- Rust reads stdout/stderr concurrently via tokio::spawn + join to prevent pipe deadlock
- Biome segfaults on this machine (exit -1073741819) — use `npx tsc --noEmit` and IDE diagnostics instead
