# Release and update feed

Windows ARM64 only, NSIS installer. Workflows: `.github/workflows/ci.yml` (every PR and push to main) and `.github/workflows/release.yml` (tag `v*`). Version files: `scripts/` (`npm run version:bump -- <x.y.z|patch|minor|major>`, `npm run version:check [-- vX.Y.Z]`).

## Cut a release
Shortcut: `npm run release -- <patch|minor|major|x.y.z>` (add `--dry-run` to only check) or the `/release` skill; both do steps 1 to 3 and push the tag. The steps below are the manual version.
1. `npm run version:bump -- patch` (or `minor`, `major`, or an exact `x.y.z`). This sets `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Run `cargo check` in `src-tauri/` so `Cargo.lock` picks up the new version, then commit the four files.
3. `git tag vX.Y.Z` on that commit, push the commit and the tag.
4. The Release workflow checks the tag matches the files, runs the checks, builds the installer and creates a **draft** release with the installer, its `.sig` and `latest.json`.
5. Open the draft on GitHub. Replace the placeholder release notes, check the files, then **publish**. Publishing makes it the latest release, which is what the updater reads.

Drafts are not visible to the updater, so a broken build can be deleted before anyone gets it.

## Update feed
- The endpoint is the latest published release asset: `https://github.com/andrew-c0/LocalGenie/releases/latest/download/latest.json` (set in `plugins.updater.endpoints`).
- `latest.json` holds the version, the notes, the installer URL and its minisign signature (from the `.sig` file). The app checks it against the public key in `plugins.updater.pubkey` in `tauri.conf.json`.
- The updater only offers a version greater than the installed one.

## Keys and secrets (never in the repo)
- Updater key pair from `npx tauri signer generate -w <path>`. The public key goes in `tauri.conf.json`. The private key and its password are GitHub Actions secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (Settings > Secrets and variables > Actions).
- Keep a backup of the private key and password in a password manager or offline. The release workflow fails early if either secret is missing.

## Test an update locally
The local feed is in `scripts/updater-test/` (tested 2026-11-10: 0.1.0 updated to 0.1.1). Configs are passed with `--config`; the files in the repo are not changed.
1. Build the older version with the test feed config and install it: `npm run tauri build -- --debug --bundles nsis --config scripts/updater-test/test-feed.conf.json`. The endpoint is built into the app. Tauri signs the installer with `TAURI_SIGNING_PRIVATE_KEY` and its password variable, so set both in the shell.
2. Build the newer version the same way with `--config scripts/updater-test/newer-version.conf.json` (sets 0.1.1). The installer lands in `src-tauri/target/debug/bundle/nsis/`.
3. Run `node scripts/updater-test/serve-feed.mjs`. It serves `http://127.0.0.1:8765/latest.json` and the newest installer from that folder (Ctrl+C to stop). The `http://` endpoint is allowed only by the test config (`dangerousInsecureTransportProtocol`).
4. Run the older app, check for updates in Settings > Application & Runtime, install, and confirm the app restarts as the newer version.

## Skipped for now
- Authenticode code signing: SmartScreen warns on the installer. The disabled placeholder step is in `release.yml`; when a certificate exists, sign through `bundle.windows.signCommand` so the updater signature covers the signed installer.
- Microsoft Store (the updater would need to be off in a Store build; no switch exists yet), x64 builds, automatic changelog (the notes are written by hand in the draft).

## Risks
- Losing the private key means existing installs can never update. A new key needs a new public key in a new build, so users reinstall by hand. Back it up.
- A leaked private key lets someone sign an update for every install. Rotate it and ship a manual reinstall.
- Publishing a draft with placeholder notes or the wrong version is visible at once to every installed app.
- The CI and release workflows were written without a run on GitHub: the first tag push is the test. Check the runner label `windows-11-arm` and the tauri-action inputs on the first run.
