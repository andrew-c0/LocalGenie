# Plan: per-model setting probe ("Scan for available settings")

Status: proposed, not started. Extends `plans/model-capability-summary.md`, which covers the pre-load side (GGUF header, hub metadata). This plan covers the post-load side: test each setting against the running model, record the result, and reuse it.

## Goal
For each downloaded model, know which settings work, which the server rejects, and which it accepts but we cannot observe. Show that on the Inference & Sampling screen, and let the user run the test on demand.

## Key constraint (verified in `memories/repo/geniex-server-behaviour.md`)
- The server keeps one model loaded. Load parameters (`nctx`, `ngl`, `compute`, `power_mode`, `spec_*`) are part of the cache key, so changing one reloads the model.
- Sampling parameters (`temperature`, `seed`, `presence_penalty`, ...) travel in the chat body and do not reload.

So the scan has two tiers with very different cost:
- **Sampling tier:** one load, then many quick requests. Cheap.
- **Load tier:** one reload per value tested. Slow, and a large `nctx` can exhaust memory. Opt-in only.

## Probe design
- Each probe is a minimal request built directly, not from the saved settings: prompt like "Reply with OK", `max_tokens` small, `temperature` 0.
- Baseline request first (no test parameter). Then one request per parameter with a non-default value.
- Outcome per parameter:
  - **works**: HTTP 200 and the parameter has an observable effect. Only for parameters where we can check it (e.g. `stop`: output is cut before the sequence; `seed`: two runs with the same seed match).
  - **accepted**: HTTP 200, but no observable effect is checkable (e.g. `presence_penalty`). Shown as "accepted, effect not verified".
  - **rejected**: non-200 or error text. Store the raw message, with a matched category when a known pattern fits.
  - **inconclusive**: timeout or unrelated failure. Retry once, then store as inconclusive, not rejected.
- Every probe is written to the server logs (`ServerLogsCard`) so the result can be checked.

## Storage (same pattern as per-model settings, no JSON file)
- New table `model_capability_values`, mirroring `model_setting_values`: PK (`model_id`, `key`), `value` (JSON text), `updated_at`. One row per setting per model. `model_id` is the name without `:precision`.
- `value` holds one result object: `{"status": "works" | "accepted" | "rejected", "detail": string | null, "probedAt": number, "fingerprint": {"size": number, "mtime": number, "geniex": string}}`. The fingerprint is repeated on each row so every row can be checked alone. A row is stale when its fingerprint no longer matches the file or the GenieX version.
- Keys are declared once in a `capability_keys!` macro in `src-tauri/src/model_capabilities.rs`, following `model_settings.rs`. The macro checks each value's shape before writing. Unknown rows are skipped on load.
- New versioned migration that only creates the table. Do not edit the applied `m20261023_000001_model_setting_values`.
- Entity under `src-tauri/src/entities/model_capability_value.rs`. Commands: `load_model_capabilities(model)` and `scan_model_capabilities(model)`, which probes and writes the rows in one transaction.
- Frontend: wrappers in `services/database.ts`, types in `types.ts`.

## Scan flow
1. Button "Scan for available settings" in `ModelSettings.tsx`. Requires the model loaded; offers to load it if not.
2. Scan runs the sampling tier. The user's saved settings are not changed.
3. Progress bar with the current parameter, and a Cancel button.
4. Results appear next to each control as a badge plus the info icon's text. Stored and reloaded on next open.
5. Load tier is a separate button, with a warning about reloads and memory.

## Files (representative)
- New: `src-tauri/src/model_capabilities.rs` (keys, save/load, as `model_settings.rs`), `src-tauri/src/commands/capabilities.rs` (probe runner), a migration, an entity, `src/utils/capabilityProbes.ts` (probe definitions and outcome classification, with tests), a status badge in `components/ModelSettings/`.
- Changed: `src-tauri/src/lib.rs` (register commands and migration), `src/services/database.ts`, `src/types.ts`, `src/components/ModelSettings/ModelSettings.tsx`.
- Reuse: `build_chat_body` / the chat request path in `commands/chat.rs`, `apply_load_params` in `commands/chat_helpers.rs`, the server log `record` in `commands/logs.rs`.

## Verification
- Rust: classification of synthetic error bodies; migration test; fingerprint staleness.
- Frontend: probe definitions and outcome mapping in vitest.
- Live: scan `unsloth/Qwen3.5-0.8B-GGUF` (llama.cpp, no projector). Confirm `stop` and `seed` come out as "works" and that a bogus value is "rejected". Repeat on a QAIRT model: `nctx` and speculation should come out as rejected or ignored.
- `cargo test`, `cargo clippy`, `npm run check`, `npm run lint`, `npx vitest run`.

## Decisions (from review)
- **Sampling tier only** for this change. The load tier is a later, separate opt-in.
- **On demand only.** The scan starts from a button on the settings page for the selected model. No background or automatic runs.
- **Save the result** after each scan (the `model_capabilities` table above), so the configuration persists across sessions.
- **Three states:** works / accepted (effect not verified) / rejected. Inconclusive probes are retried once, then reported as not run.
