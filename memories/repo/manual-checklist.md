# Manual checklist (after build / deployment)

Run through these checks manually after building or deploying the app. Automated checks cannot fully verify installer behavior, filesystem permissions, or OS-level interactions.

## CLI update download — folder & permissions

- [ ] **Installer downloads into the correct folder**
  - Trigger an update from App Settings → GenieX CLI → "Update Now".
  - Verify the file `geniex-cli-setup-windows-arm64-v<version>.exe` appears in the app data directory:
    `%APPDATA%\com.localgenie.app\` (resolve via `app.path().app_data_dir()` in Rust).
  - Confirm the file size roughly matches the asset size shown on the GitHub release page (a truncated download indicates a failed stream that was still written to disk).

- [ ] **App is allowed to download (network/CSP)**
  - Confirm no CSP violation errors appear in the dev console when the download starts (`connect-src` must permit `https://api.github.com` and the release download host `https://github.com` / `objects.githubusercontent.com`).
  - If the download fails instantly with a network error, check whether the Tauri CSP in `src-tauri/tauri.conf.json` blocks outbound HTTPS to GitHub.
  - Verify corporate proxy / firewall scenarios: the app uses `reqwest` with a `LocalGenie/0.1` User-Agent; some proxies block unknown agents.

- [ ] **Downloaded installer is executable**
  - Windows may mark downloaded files with a Mark-of-the-Web (MOTW) zone identifier. Confirm double-clicking or spawning the installer does not trigger a SmartScreen block that silently prevents launch.
  - If SmartScreen blocks it, verify `launch_installer()` surfaces the failure instead of hanging the version poll.

- [ ] **Version polling behaves correctly**
  - After completing the installer, the app should detect the new version within ~3s and show "Updated to v<latest>".
  - Cancel the installer mid-way and confirm the app keeps polling, then times out after 5 minutes with the manual-download error message.
  - Confirm the sidebar settings badge disappears once `update_available` becomes false.

## General build sanity

- [ ] `npm run check` passes (TypeScript, no errors).
- [ ] `npm run lint` passes (Biome — 0 errors, 0 warnings as of 2026-09-18).
- [ ] `cargo check` passes in `src-tauri/` (no warnings introduced).
- [ ] `npm run build` produces MSI + NSIS bundles under `src-tauri/target/release/bundle/`.
- [ ] App launches from the built bundle and the server connects on the configured port (default `18181`).

## Stitch UI regression (after the 2026-09-18 frontend rebuild)

- [ ] All 6 views render and switch via the sidebar: Overview, Models, Chat & Playground, Benchmarks, Prompt Bench, Settings — without losing active session or server status.
- [ ] Chat: streaming updates in place, `chat-done` records generation stats, retry removes later messages in both Zustand and SQLite.
- [ ] Models: search → pull → progress → completion refresh; Load & Chat sets active model; remove confirmation works; repo filter chips behave.
- [ ] Settings: port save/probe persists; CLI update card reflects `updateInfo` (badge on sidebar settings entry is currently gone — settings moved to a page, verify update badge UX still acceptable).
- [ ] Prompt Benchmark: `Ctrl+Enter` executes a real streaming run against the local server; TTFT/throughput values change between runs; recent runs list updates.
- [ ] Benchmark page: ranking populated from real chat stats only (no fabricated numbers); bandwidth/thermal cards show "—/N/A".
- [ ] Responsive: sidebar collapses to icon rail ≤860px; model grid 3→2→1 columns; settings rows stack; chat session list hides on narrow widths.
- [ ] Keyboard: Escape closes model-remove dialog; nav items are real buttons (focusable); sliders are labelled via `aria-labelledby`.
