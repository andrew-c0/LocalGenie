# CLI update feature

## Status
- CLI update checks exist in the Rust backend and frontend service layer.
- The backend now treats a ready-to-install output as a successful update path even when the process exit code is not ideal.

## Known caveat
- On Windows, `geniex update` may still exit with code 1 even after the download appears to complete; the app handles this by showing restart guidance rather than looping retries.

## Important behavior
- Frontend dismisses the banner after download completion and prompts the user to restart.
- Concurrent stdout/stderr reads prevent pipe deadlocks during CLI update execution.
