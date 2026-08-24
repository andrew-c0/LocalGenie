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
- [ ] `npm run lint` passes (Biome).
- [ ] `cargo check` passes in `src-tauri/` (no warnings introduced).
- [ ] `npm run build` produces MSI + NSIS bundles under `src-tauri/target/release/bundle/`.
- [ ] App launches from the built bundle and the server connects on the configured port (default `18181`).
