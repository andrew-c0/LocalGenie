# Database architecture

## Summary
- SQLite database is managed with sea-orm and migrations.
- Startup runs pending migrations automatically.
- Database access is through Tauri command handlers and typed service wrappers.

## Primary tables
- `chat_sessions`: session metadata
- `messages`: chat messages tied to a session. Uncommitted columns: `attachments` (JSON text: the files sent with a user message, `id`, `kind`, `name`, `size`, `path`, `chars`; null when none; contents are not stored), `prompt_tokens` and `completion_tokens` (the server's exact counts for an assistant reply; null for older rows and stopped replies).
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
