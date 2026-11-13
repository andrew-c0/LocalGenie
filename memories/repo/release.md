# Release and update feed

Windows ARM64 only, NSIS installer. Workflows: `.github/workflows/ci.yml` (every PR and push to main) and `.github/workflows/release.yml` (tag `v*`). Version files: `scripts/` (`npm run version:bump -- <x.y.z|patch|minor|major>`, `npm run version:check [-- vX.Y.Z]`). Line endings: `.gitattributes` forces LF in the repo and in every checkout.

Confirmed on GitHub (2026-11-10/11): CI passes on `windows-11-arm` (about 20 min). The Release run for tag `v0.1.1` succeeded (about 30 min) and created the release "LocalGenie v0.1.1" with `LocalGenie_0.1.1_arm64-setup.exe`, its `.sig` and `latest.json`; the release is published and marked Latest. The repo is public and both signing secrets are set. The installed app (already 0.1.1) reads the real feed over TLS (native-tls) and gets a valid `latest.json`.

## Cut a release
Shortcut: `npm run release -- <patch|minor|major|x.y.z>` (add `--dry-run` to only check) or the `/release` skill (`.claude/skills/release/SKILL.md`, user-invoked only). The script checks `main` and a clean tree, bumps the version files, refreshes `Cargo.lock`, commits "Release X.Y.Z", pushes, then tags `vX.Y.Z` and pushes the tag. `npm run release -- 0.1.2` was run end to end on 2026-11-13: it made the version bump commit febb07b, pushed tag v0.1.2, and the Release workflow started. The draft is not published yet (step 5). The `/release` skill itself has not been run.

Manual version:
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

## Gotchas (each one broke a run)
- Actions shells: the Windows runner defaults to PowerShell. A step that reads `$TAG` or other `$VAR` must set `shell: bash`, or PowerShell expands it to empty (the tag check failed this way).
- Line endings: CRLF checkouts failed Biome. `.gitattributes` (`* text=auto eol=lf`) fixes it; keep it.
- An ignored file needed by the build breaks CI. `include_str!` reads `playground/testdata/sd-cli-sd-turbo.log`; the `.gitignore` exception keeps it tracked. A file that is ignored locally but absent on the runner fails `cargo clippy --all-targets` and the Rust tests.
- A hand-made release with no assets (or a draft that was never filled) makes the feed unreadable for the installed apps. Only publish the Release workflow's draft, after it holds the installer, `.sig` and `latest.json`.

## Keys and secrets (never in the repo)
- Updater key pair from `npx tauri signer generate -w <path>`. The public key goes in `tauri.conf.json`. The private key and its password are GitHub Actions secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (Settings > Secrets and variables > Actions). Both are set.
- Keep a backup of the private key and password in a password manager or offline. The release workflow fails early if either secret is missing.

## Test an update locally
The local feed is in `scripts/updater-test/` (tested 2026-11-10: 0.1.0 updated to 0.1.1). Configs are passed with `--config`; the files in the repo are not changed.
1. Build the older version with the test feed config and install it: `npm run tauri build -- --debug --bundles nsis --config scripts/updater-test/test-feed.conf.json`. The endpoint is built into the app. Tauri signs the installer with `TAURI_SIGNING_PRIVATE_KEY` and its password variable, so set both in the shell.
2. Build the newer version the same way with `--config scripts/updater-test/newer-version.conf.json` (sets 0.1.1). The installer lands in `src-tauri/target/debug/bundle/nsis/`.
3. Run `node scripts/updater-test/serve-feed.mjs`. It serves `http://127.0.0.1:8765/latest.json` and the newest installer from that folder (Ctrl+C to stop). The `http://` endpoint is allowed only by the test config (`dangerousInsecureTransportProtocol`).
4. Run the older app, check for updates in Settings > Application & Runtime, install, and confirm the app restarts as the newer version.

## Not yet verified
- Downloading and installing an update from the GitHub feed. This needs the v0.1.2 draft published (it is not yet) and an older install (0.1.1 or earlier) that reads it.
- A non-debug installer (the 0.1.1 installer was built by the workflow; its install and update path is not yet tested in the app).
- The `/release` skill end to end. (`npm run release` ran end to end for 0.1.2, see "Cut a release".)

## Skipped for now
- Authenticode code signing: SmartScreen warns on the installer. The disabled placeholder step is in `release.yml`; when a certificate exists, sign through `bundle.windows.signCommand` so the updater signature covers the signed installer.
- Microsoft Store (the updater would need to be off in a Store build; no switch exists yet), x64 builds, automatic changelog (the notes are written by hand in the draft).

## Risks
- Losing the private key means existing installs can never update. A new key needs a new public key in a new build, so users reinstall by hand. Back it up.
- A leaked private key lets someone sign an update for every install. Rotate it and ship a manual reinstall.
- Publishing a draft with placeholder notes or the wrong version is visible at once to every installed app.
