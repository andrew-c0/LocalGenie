---
name: release
description: Cuts a LocalGenie release - bump the version, commit, push, tag and push the tag so the Release workflow builds a draft. Use only when the user types /release (or asks to cut or publish a new version).
disable-model-invocation: true
---
# Cut a release

Arguments: `patch`, `minor`, `major` or an exact `x.y.z` (ask which if none was given; default suggestion `patch`). Never run this on your own initiative: it pushes a commit and a tag.

1. **Dry run.** `node scripts/release.mjs <arg> --dry-run` checks the branch is `main`, the tree is clean and nothing is behind origin. If the tree has uncommitted work, stop and suggest `/ship` first.
2. **Verify.** Run `npx tsc --noEmit`, `npx biome check src` and `npx vitest run`, plus `cargo clippy` and `cargo test` in `src-tauri/`. Stop on a failure and show it.
3. **Confirm.** Say the new version and tag in one line (current version from the dry run) and wait for a yes unless the user's message already named the exact version.
4. **Release.** `node scripts/release.mjs <arg>`. It bumps `package.json`, `Cargo.toml`, `tauri.conf.json`, refreshes `Cargo.lock`, commits "Release X.Y.Z", pushes, tags `vX.Y.Z` and pushes the tag. Do not amend its commit.
5. **Report.** The tag, and the remaining manual steps: watch the Release run in the Actions tab, replace the placeholder notes of the draft, check it holds the installer, `.sig` and `latest.json`, then publish it (see `memories/repo/release.md`).
