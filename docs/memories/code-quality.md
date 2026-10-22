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

## Biome specifics (verified 2026-09-18, CLI 2.5.14)
- Config schema version in `biome.json` must match the CLI version (2.5.7 → 2.5.14 was migrated by hand).
- `nursery.noUnusedClasses: "off"` — the rule cannot see runtime-composed classes (`` `${styles.badge} ${tone}` ``) or Fluent-generated names; ~150 false positives otherwise.
- `complexity.noImportantStyles: "off"` — `!important` overrides of Fluent inline styles are intentional. NOTE: this rule lives under `complexity`, NOT `style`; placing it under `style` fails config deserialization with "unknown key".
- Hook dependency issues are fixed by reading store state via `useChatStore.getState()` inside callbacks (stable deps), or module-level constants for `useMemo` (see `ThroughputChart` PAD).
- a11y: use semantic `<button>` for clickables, `role="presentation"` for modal backdrops with `role="dialog"` on the panel, `aria-labelledby` on Fluent `Slider` wrappers instead of `<label>` (labels without associated controls trigger `noLabelWithoutControl`).
- Biome previously crashed on this machine (0xC0000005) with 2.5.7; user fixed it locally. On Windows/PowerShell, pipe output through `Out-String` or redirect to a file to read it reliably.
- Verified commands: `npm run check`, `npx biome check src/` (currently 0 errors, 0 warnings), `npm run build:frontend`.
