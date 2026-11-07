# Install, update and uninstall pipeline: plan

Status: phase 1 built and partly tested by the user (2026-11-07, debug installer); phases 2 to 4 planned, not started. Facts below marked "verify" come from memory of the Tauri 2 docs and must be checked against the current docs before building.

## Where things are today
- `src-tauri/tauri.conf.json`: `bundle.targets` is `all`, no `createUpdaterArtifacts`, no `windows` block, version `0.1.0` (also in `package.json` and `Cargo.toml`: three places to keep in step). Plugins: shell, dialog, notification. No updater plugin, no CI workflow, no release process (only a git remote on GitHub, `andrew-c0/LocalGenie`).
- Data the app creates, by owner:
  - App data dir `%APPDATA%\com.localgenie.app` (Tauri `app_data_dir`): the SQLite database (chats, settings, benchmarks), `playground-models` (curated image, upscale and speech models, tens of GB), `runtimes` (sd-cli, sherpa-onnx), legacy `playground/images`, benchmark files.
  - `%USERPROFILE%\Downloads`: Hugging Face and AI Hub files while a download runs; the finished ones are imported into GenieX. User-visible, never removed by the app.
  - Pictures: generated images (user data, never removed).
  - GenieX, not ours: the CLI install (Inno Setup, `%LOCALAPPDATA%\GenieX CLI`, installed and removed by `runtime_install` / `runtime_uninstall`) and its model cache `%USERPROFILE%\.cache\geniex\models` (or `GENIEX_DATADIR`), which holds every imported chat and OCR model.
- Runtime update checks and native notifications already exist (checked at start and every 6 hours); the app-update notification can reuse them.

## Goals
1. A normal Windows installer (ARM64 first, x64 if the build is easy) that installs per user, with no admin prompt.
2. An uninstaller that removes the app and, only when the user ticks it, the data the app created.
3. In-app updates: check, tell the user, download, install and restart.
4. A repeatable release (CI) that builds, signs and publishes the installer and the update feed.

## Decisions for the user (with a recommendation)
1. Installer: **NSIS** (recommended). Tauri's NSIS bundle supports per-user installs, hooks (`installerHooks`) and a built-in "delete the application data" checkbox on uninstall, and the updater works with it. MSI is per-machine and has no hook for our custom cleanup.
2. Install scope: **per user** (`installMode: currentUser`), because everything we write is in the user profile and the GenieX CLI also installs per user.
3. Update feed: **GitHub Releases** (recommended): a release asset `latest.json` plus the signed installer; the updater endpoint points at the repository's latest release. Needs the repository (or at least its releases) to be reachable without login; a private repository needs another host.
4. Signing: the **updater needs its own minisign key pair** (free, we generate it; the private key lives in CI secrets, the public key in `tauri.conf.json`). **Authenticode code signing** (a certificate, paid, or Azure Trusted Signing) is separate: without it Windows SmartScreen warns on the installer. Decide whether to buy or skip for now.
5. Uninstall scope for GenieX: the app's uninstaller offers (a) remove LocalGenie's own data (database, playground models, runtimes), default off, and (b) separately, remove the GenieX CLI and its model cache, default off, because the user may use GenieX outside LocalGenie and the cache holds chat models downloaded for it. Never touch Downloads or Pictures.

## Decisions taken (2026-11-07)
- Update feed: GitHub Releases on `andrew-c0/LocalGenie` (asset `latest.json` plus the signed installer).
- Authenticode code signing: skipped for now (SmartScreen will warn); the updater's own minisign key is still required.
- Targets: Windows ARM64 only; no x64 installer or CI job.
- Uninstall (2026-11-07, user): the uninstaller first removes the runtimes (the GenieX CLI through its silent uninstaller, which works silently so it is no longer a risk; sd-cli and sherpa-onnx are folders under the app data), then the app itself. Downloaded models and settings are deleted in the same run behind one confirmation page that lists what goes and its size; Downloads and Pictures are never touched. This replaces the two separate questions of decision 5.
- Still as recommended: NSIS, per-user install, two opt-in uninstall questions (LocalGenie data; GenieX CLI and cache, confirmed twice).

## Phases
### Phase 1: a proper installer and uninstaller
Built (2026-11-07). User-tested: per-user install, app from the installed copy, Storage card rows, database name, both uninstall cleanup variants (0 failed steps). Not tested: see `known-issues.md` ("Installer and uninstall (phase 1)") and the unticked items in `manual-checklist.md` ("Installer, uninstall and Storage").
- Set `bundle.targets` to `["nsis"]`, add `bundle.windows.nsis` (`installMode: currentUser`, `installerHooks`, `displayLanguageSelector` off, an icon and a header image if wanted), set publisher, copyright and short description.
- Uninstall hook (`NSIS_HOOK_PREUNINSTALL`): ask the two questions from decision 5 (the built-in checkbox covers `%APPDATA%\com.localgenie.app`; a second page or message box handles the GenieX CLI and cache, implemented by running GenieX's own `unins000.exe` silently, the same way `runtime_uninstall` does, and deleting the cache folder only after a second confirmation that names the folder and its size). The running app must be closed first (Tauri's NSIS already kills the process; verify) and the server process LocalGenie started stopped.
- Rust side (small): a command that reports the sizes of the data folders, used by a new Settings > Application & Runtime card "Storage" with a link to open each folder (helps the user before uninstalling and answers "where did my disk space go").
- Manual test on a clean Windows ARM64 VM or the dev machine: install, run, download a model, uninstall without and with the checkbox, reinstall, check nothing is left in each case.

### Phase 2: in-app updates
- Add `tauri-plugin-updater` (Rust and JS), register it, add the `updater:default` capability, `plugins.updater` with `pubkey`, `endpoints` and `windows.installMode` (`passive` shows progress; verify), set `bundle.createUpdaterArtifacts: true`.
- Frontend service `src/services/appUpdate.ts` (only place that calls the plugin): `checkForAppUpdate`, `downloadAndInstall` with progress events. A hook (`useAppUpdate`) checks at start and every 6 hours, stores the result in a small store and sends the native notification once per version (reuse the runtime-update notification code). UI: a banner or a card in Settings > About and Settings > Application & Runtime ("Version 0.1.0, update 0.2.0 available", release notes from the feed, Download and restart), with the offline pattern (skeleton, Try again, automatic retry when the connection returns). A download in progress must not be lost: the updater download is its own flow, but quitting the app during a model download should warn (the close guard exists in `CloseGuard.tsx`).
- Never update while a generation, benchmark or download runs without asking; the install restarts the app.
- Database migrations run at start and are forward-only: an update after a downgrade is not supported; say so in the release notes.

### Phase 3: release pipeline
- GitHub Actions workflow on a version tag: build on `windows-11-arm` (verify availability) and `windows-latest` for x64, run the checks (`npm run check`, `lint`, `test`, `cargo clippy`, `cargo test`), `tauri build` with `TAURI_SIGNING_PRIVATE_KEY` and its password from secrets, upload the installer, its `.sig` and `latest.json` (tauri-action can generate it) to a draft release; publishing the draft is a manual step. Keep the version in one place (script that bumps `package.json`, `Cargo.toml`, `tauri.conf.json` together, with a test that they agree).
- Optional: Authenticode signing step once a certificate exists.

### Phase 4: polish and docs
- Settings > About: current version, "Check for updates", link to the release notes. Docs: a short `memories/repo/release.md` (how to cut a release, where the keys are, how to test an update locally with a second feed URL), update `codebase-map.md`, `manual-checklist.md` and `known-issues.md`.

## Risks
- Uninstall deletes user data: every deletion is opt-in, names the folder, and the GenieX cache one is separate and confirmed twice. Test on a spare profile first.
- Updater key loss means existing installs can never update: back the private key up outside the repository and CI.
- Without Authenticode the installer shows a SmartScreen warning and some antivirus tools flag unsigned installers that spawn child processes (the app runs `geniex` and downloads runtimes).
- ARM64 CI runners and the ARM64 GenieX CLI: the app is useful mainly on Windows ARM64 (the runtimes are gated to it); decide whether an x64 build ships at all.
- The Inno Setup uninstaller name and silent flags GenieX uses are assumed, not tested (see `cli-update.md`): the uninstall hook depends on them.

## Order of work and size
Phase 1 (medium), then phase 2 (medium to large, needs decisions 3 and 4), then phase 3 (medium), phase 4 (small). Phases 1 and the Storage card can start without any decision besides 1, 2 and 5.
