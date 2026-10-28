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
  - Note: the installer download runs in Rust (`reqwest`), so the webview CSP does not apply to it. The CSP check above only matters for webview `fetch` calls.

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

## Chat attachments (not yet run)

- [ ] Attach menu: Image and Audio are disabled until the model's settings scan confirms vision or audio; Text file is always enabled. Up to 4 files per message.
- [ ] Send an image and an mp3 clip (mp3 is not verified with the server; see known-issues). The reply uses the content; a wav clip is the verified path.
- [ ] Send a text file, then a second message: the model still has the file, and the context ring shows the file arc.
- [ ] Move a sent file, then send again: the send goes ahead without that file, and a "Files not sent" toast names it. The toast repeats on each send.
- [ ] Delete that message (hover the bubble, trash icon, confirm): the message and every later one leave the chat and do not come back after a reload. The next send has no warning and the model no longer gets the file.
- [ ] Delete a user message in the middle of a chat, then an assistant message: each confirm removes it and all after it, and the context ring drops accordingly. A cancelled confirm changes nothing.
- [ ] Retry and Delete buttons appear only on hover or keyboard focus, and Retry is absent on a message whose file has no stored path.
- [ ] Open a tile, then "Open location": Explorer opens the folder with the file selected.
- [ ] Retry on the last user message re-sends its files; a reply that reports counts shows the exact total in the ring.

## Stitch UI regression (after the 2026-09-18 frontend rebuild)

- [ ] All views render and switch via the sidebar: Overview, Models, Chat, Benchmarks, Settings — without losing active session or server status.
- [ ] Chat: streaming updates in place, `chat-done` records generation stats, retry removes later messages in both Zustand and SQLite.
- [ ] Chat welcome: `/chat` with no open conversation shows the status (Running/Stopped) and up to 3 recent conversations; New conversation twice opens the same empty draft; leaving an empty draft leaves nothing in the list after a reload; the first send stores it.
- [ ] Pin: a pinned conversation lists first and keeps its place after a reload; unpin returns it to recency order.
- [ ] Models: search → download → import → progress → completion refresh; cancel and resume from the drawer; duplicate click is ignored; Load & Chat sets active model; remove confirmation works; repo filter chips behave.
- [ ] Settings: port save/probe persists; CLI update card reflects `updateInfo` (badge on sidebar settings entry is currently gone — settings moved to a page, verify update badge UX still acceptable).
- [ ] Benchmarks, Run: with a model loaded, start a suite; each step appears as it finishes; the run appears in Runs; Cancel keeps the finished steps; chat and model load are refused until the run ends. Compute and the Windows power plan/battery are recorded for the run (not yet verified against a live model).
- [ ] Benchmarks, Prompt Library: a prompt used by a suite cannot be deleted; a file removed from a saved prompt leaves the disk when no other prompt or step uses it.
- [ ] Overview "Recent Generation Speeds" shows chat-based figures only; Compare charts use the selected runs; CSV and PNG exports open the save dialog and "open" works on the saved file.
- [ ] Responsive: sidebar collapses to icon rail ≤860px; model grid 3→2→1 columns; settings rows stack; chat session list hides on narrow widths.
- [ ] Keyboard: Escape closes model-remove dialog; nav items are real buttons (focusable); sliders are labelled via `aria-labelledby`.

## Qualcomm AI Hub tab (not yet run)

- [ ] Models > Qualcomm AI Hub lists models with runtime 11 or 12 and a runnable asset; the name filter and the domain chips narrow the list; the list loads with no network error.
- [ ] A runtime 12 (GGUF) asset downloads through the Hugging Face pipeline, imports, and the model loads; a runtime 11 zip imports and loads (runtime 2, 3 and 6 are not listed).
- [ ] Open a model: domain, licence, model card and QAIRT assets load. With the assets unreadable, the page shows "Assets unavailable" and the model info still shows.
- [ ] With GenieX's `chipset` set to this device's chipset: a universal asset and this chipset's asset download. Another chipset's asset is refused with a "Download failed" toast.
- [ ] A download runs in the drawer, then "Model ready"; the zip and its `aihub--<id>` folder are gone from Downloads. A failed import keeps the zip, and Resume reuses it.
- [ ] After a restart, the imported model is listed under Local, and `list_models` reports its `source` as `aihub` (check the value in the dev console).
