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
- `chat_sessions`: session metadata. `pinned` (bool, default false): pinned sessions list first. Migration `m20261026_000001_chat_session_pinned`. `settings_overrides` (JSON text object holding only the keys the chat overrides; null = the model's settings). Migration `m20261030_000001_chat_session_overrides`.
- `messages`: chat messages tied to a session. Columns: `attachments` (JSON text: the files sent with a user message, `id`, `kind`, `name`, `size`, `path`, `chars`; null when none; contents are not stored), `prompt_tokens` and `completion_tokens` (the server's exact counts for an assistant reply; null for older rows and stopped replies), `kind` (`text` default, or `system` for a system line), `system_type` (set only for system lines, e.g. `model_changed`; migration `m20261031_000001_message_kind`), `compute` (`npu`, `gpu` or `cpu` an assistant reply was generated on; null when not kept; migration `m20261032_000001_message_compute`), `tool_calls` (JSON array of the calls an assistant reply made) and `tool_record` (JSON of one `tool` row; its result text is in `content`), both null otherwise (migration `m20261038_000001_message_tool_fields`, working tree 2026-11-11).
- `model_setting_values`: one row per setting per model. PK (`model_id`, `key`); `value` is the setting's JSON text; `model_id` = name without `:precision`. Keys and their Rust types are declared in `src-tauri/src/model_settings.rs`; `save` replaces a model's keys in one transaction. Frontend sees one object per model via `load_model_settings` / `save_model_settings`. The per-model `compute` key was deleted by migration `m20261037_000001_drop_model_compute_setting` (bbe159f); the compute target is the header's.
- `model_capability_values`: one row per scan key per model. PK (`model_id`, `key`); `value` is the result JSON (`status`, `detail`, `probedAt`, `fingerprint`, `source`). Written only by `model_capabilities::save`, which applies the write-once rule (a `works` row is never overwritten by a non-works result and never removed). Migration `m20261023_000002_model_capability_values`.
- `model_settings` (legacy, unused): the old one-JSON-row-per-model table. Kept by migration `m20261023_000001_model_setting_values` (which copies it into `model_setting_values`) so the data stays recoverable; no entity.
- `user_preferences`: key-value app settings such as `server_port`
- `installed_runtimes` (migration `m20261034_000001_create_installed_runtimes`, committed c16d489): one row per optional runtime, PK `runtime_id` (e.g. `sd-cpp`). Columns: `version` (release tag), `install_path` (`<app data>/runtimes/<id>/<version>`), `source_url` (the GitHub asset), `sha256` (the archive as downloaded), `backend` (null; unused), `installed_at` (epoch ms). Written only by `commands/runtimes/store.rs`: an install replaces the row, an uninstall deletes it. Older version folders on disk have no row.
- `mcp_server` (migration `m20261039_000001_create_mcp_servers`, 2026-11-13): one row per MCP server the user added. PK `id` (UUID text; the form sends an empty id for a new server). Columns: `name`, `transport` (`stdio` or `http`), `command` (stdio only, else null), `args` (JSON array text), `env` (JSON object text), `url` (http only, else null), `headers` (JSON object text), `enabled` (connect at app start), `created_at` (epoch ms, kept on update). Written only by `commands/tools/mcp/store.rs`. Env values and headers are stored as plain text (no credential store). Running state is not stored; it lives in `McpManager` memory.
- Playground image models have no table. Their state is read from the files under `<app data>/playground-models/`, and generated images are plain PNG files (no row).
- `downloaded_models`: GGUF models imported into GenieX (`name` primary key; precision, context_size, param_count, repo_url, model_card, timestamps). Written by `import_gguf` and `upsert_downloaded_model`, read by the model page.
  - `base_ram_bytes`, `context_ram_bytes` (big integers) and `ram_approximate` (bool), all null until computed (migration `m20261036_000001_downloaded_model_ram`, bbe159f). Written only by `commands/ram_store.rs`: at import, when the saved `nctx` changes, and by `backfill_model_ram` at startup for rows with a null base column. The model selector adds the two byte columns; no model files are read there.
  - `facets` (text, null; migration `m20261033_000001_downloaded_model_facets`, committed 2122ed2): the Hub facet summary as a JSON object (`task`, `library`, `license`, `paramCount`, `paramCountApproximate`, `baseRelation`, `baseRepo`, `quantBits`; shape in `utils/hubModelInfo.ts`). Null for rows saved before it. The write is checked to be a JSON object (`validate_facets`).
  - `facets.source` (committed in 7664d01): `hf` or `aihub`, written by `import_gguf` and `import_aihub_zip` (`facets_with_source`), read by `list_models` (`stored_sources`). Rows without it fall back to the name guess. AI Hub rows have `library` `QAIRT`. No new migration for it.

## Patterns
- Use `MigrationTrait` for versioned schema changes.
- Keep entities in `src-tauri/src/entities/`.
- Use `INSERT ... ON CONFLICT ... DO UPDATE` for idempotent upserts.
- Respect foreign-key relationships and avoid destructive cascade behavior when updating sessions.

## Notes
- Default port is `18181`.
- The app stores user preference keys in a simple value-type table.
