# Database architecture

## Summary
- SQLite database is managed with sea-orm and migrations.
- Startup runs pending migrations automatically.
- Database access is through Tauri command handlers and typed service wrappers.

## Primary tables
- `chat_sessions`: session metadata
- `messages`: chat messages tied to a session
- `model_settings`: per-model generation parameters
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
