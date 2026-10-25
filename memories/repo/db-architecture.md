# Database architecture

## Summary
- SQLite database is managed with sea-orm and migrations.
- Startup runs pending migrations automatically.
- Database access is through Tauri command handlers and typed service wrappers.

## Primary tables
- Benchmark tables (migrations `m20261027_000001`, `m20261028_000001`, `m20261028_000002`, `m20261029_000001`; entities in `src-tauri/src/entities/benchmark_*.rs`):
  - Library: `benchmark_files` (name, kind, size, chars, `stored_path` under `benchmark-files/<id>/`, `sha256`), `benchmark_prompts` (name, description, `text`, `match_rule`, `run_count`), `benchmark_prompt_keywords`, `benchmark_prompt_files` (ordered links).
  - Suites: `benchmark_suites` (mode, warmup and repetition counts, `run_count`), `benchmark_suite_steps` (ordered, one prompt each), `benchmark_step_files`.
  - Runs: `benchmark_runs` (suite id nullable + `suite_name` kept, model name and key, `compute`, status, timestamps, `windows_power_plan`, `on_battery`), `benchmark_run_steps` (per step: repetition index, warmup flag, prompt name and text, timings, status), `benchmark_run_step_files`.
  - Deleting a prompt used by a suite step is refused (foreign key); deleting a suite keeps its runs. Files are removed by the app (`remove_if_unreferenced`), not by the database.
- `chat_sessions`: session metadata. `pinned` (bool, default false): pinned sessions list first. Migration `m20261026_000001_chat_session_pinned`.
- `messages`: chat messages tied to a session. Columns: `attachments` (JSON text: the files sent with a user message, `id`, `kind`, `name`, `size`, `path`, `chars`; null when none; contents are not stored), `prompt_tokens` and `completion_tokens` (the server's exact counts for an assistant reply; null for older rows and stopped replies).
- `model_setting_values`: one row per setting per model. PK (`model_id`, `key`); `value` is the setting's JSON text; `model_id` = name without `:precision`. Keys and their Rust types are declared in `src-tauri/src/model_settings.rs`; `save` replaces a model's keys in one transaction. Frontend sees one object per model via `load_model_settings` / `save_model_settings`.
- `model_capability_values`: one row per scan key per model. PK (`model_id`, `key`); `value` is the result JSON (`status`, `detail`, `probedAt`, `fingerprint`, `source`). Written only by `model_capabilities::save`, which applies the write-once rule (a `works` row is never overwritten by a non-works result and never removed). Migration `m20261023_000002_model_capability_values`.
- `model_settings` (legacy, unused): the old one-JSON-row-per-model table. Kept by migration `m20261023_000001_model_setting_values` (which copies it into `model_setting_values`) so the data stays recoverable; no entity.
- `user_preferences`: key-value app settings such as `server_port`
- `downloaded_models`: GGUF models imported into GenieX (`name` primary key; precision, context_size, param_count, repo_url, model_card, timestamps). Written by `import_gguf`, read by the model page.

## Patterns
- Use `MigrationTrait` for versioned schema changes.
- Keep entities in `src-tauri/src/entities/`.
- Use `INSERT ... ON CONFLICT ... DO UPDATE` for idempotent upserts.
- Respect foreign-key relationships and avoid destructive cascade behavior when updating sessions.

## Notes
- Default port is `18181`.
- The app stores user preference keys in a simple value-type table.
