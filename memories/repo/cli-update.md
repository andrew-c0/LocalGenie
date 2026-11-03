# GenieX CLI install, update and removal

The GenieX CLI is a runtime in the registry at `src-tauri/src/commands/runtimes/` (`spec.rs`, `RUNTIME_SPECS`): id `geniex`, repo `qualcomm/GenieX`, `InstallKind::Installer`. Archive runtimes (stable-diffusion.cpp, sherpa-onnx) use `InstallKind::Archive`. The four runtime commands serve every runtime; `runtimes/geniex.rs` holds the installer steps.

## Commands for `geniex`
- `runtime_list`: `installedVersion` from `geniex version` (`cli::get_installed_version_timeout`), `null` when missing or not Windows ARM64. No database row.
- `runtime_check_update("geniex")`: latest stable release (`releases/latest`, cached for an hour). Works without the CLI: `installedVersion` null, `updateAvailable` false.
- `runtime_install("geniex", _)`: the version argument is ignored. Stages on `runtime-install-progress`: `checking`, `downloading` (`<app data>/<name>.part`, resumed, byte counts), `verifying` (GitHub digest, when GitHub gives one), `installing` (launches the setup `.exe` with `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART`; no UI), then `done` or `error`. The `installing` stage polls `geniex version` every 3 s for up to 5 minutes until it matches the release, then waits up to 60 s for the setup to exit, then deletes the setup `.exe` and any `.part` (best effort: a setup still running keeps its file).
- `runtime_uninstall("geniex")`: stops the server this app started, runs `unins000.exe` with the same silent flags (next to the binary or in its parent), then waits up to 60 s for `geniex version` to stop answering. No progress events.
- Cancel: `cancel_download("runtime:geniex")`. The operation holds the registry key `runtime:geniex` for the whole run, so install and uninstall cannot overlap.

## Removed (uncommitted)
`check_for_cli_update`, `update_geniex`, `check_geniex_installed`, the `geniex-update-progress` event, the `UpdateInfo` type, `cli_update.rs`, and `RuntimeInfo.installPath`.

## Notes
- Install and uninstall are gated to Windows ARM64 (`cli::platform_supported`). Listing and update checks are not.
- A failed or cancelled install keeps the setup `.exe`, but a retry downloads it again: only a `.part` file is resumed.
- Cancel during `installing` only stops the wait. The setup keeps running with no window. A resume then starts a second setup while the first may still run (code-read, not tested).
- The digest check passes when GitHub gives no digest for the asset.
- The silent flags, the `unins000.exe` name (Inno Setup's default, assumed) and the uninstaller path are not tested against a real install.
- `get_runtime_versions` in `cli.rs` are usage probes, not part of the runtime flow.
