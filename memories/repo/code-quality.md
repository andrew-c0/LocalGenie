# Code quality notes

## Standards
- Use Biome for linting/formatting.
- Keep TypeScript strict and no-`any`.
- Prefer `import type` for type-only imports.
- Avoid inline styles; keep shared styling in CSS and theme variables.

## Project rules
- Keep components small and split extraction when they exceed practical limits.
- Put shared UI in `src/components/` and domain logic in stores or services.
- Keep Rust command files domain-focused.
- Do not add unrelated dependencies or broad refactors without explicit need.

## Validation
- Prefer focused checks over broad suite runs.
- Treat the model/server warmup flow as the reliability gate for any chat-related changes.
