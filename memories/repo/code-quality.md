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
- Hook dependency issues are fixed by reading store state via `useChatStore.getState()` inside callbacks (stable deps), or module-level constants for `useMemo`.
- a11y: use semantic `<button>` for clickables, `role="presentation"` for modal backdrops with `role="dialog"` on the panel, `aria-labelledby` on Fluent `Slider` wrappers instead of `<label>` (labels without associated controls trigger `noLabelWithoutControl`).
- Biome previously crashed on this machine (0xC0000005) with 2.5.7; user fixed it locally. On Windows/PowerShell, pipe output through `Out-String` or redirect to a file to read it reliably.
- Verified commands: `npm run check`, `npx biome check src/` (2026-10-26: 9 format errors in ModelSettings, GGUFVariantList, Layouts and PageHeader files, none touched by 63f1fbc; see `known-issues.md`), `npm run build:frontend`.

## Proposed hooks (not installed; no settings written)
Claude Code hooks that would enforce the rules above. Install only after the user approves; each is a `PostToolUse` (or `PreToolUse`) hook on `Edit|Write`.
1. Biome on edit: file path matches `src/**/*.{ts,tsx}` -> run `node_modules/.bin/biome check <file>`; a non-zero exit is fed back to the agent.
2. `invoke()` outside services: file path matches `src/**/*.{ts,tsx}` and does not match `src/services/**`, and the new content matches `\binvoke\(` or `from "@tauri-apps/` -> flag. (Rule: `invoke()` and `@tauri-apps/*` only in `services/`.)
3. Inline styles: file path matches `src/**/*.tsx` and the new content matches `style=\{\{` -> flag for review. Data-driven values are allowed. Current occurrences (2026-10-26): `components/models/GGUFVariantList.tsx` (static layout styles, lines 72 and 75), `components/shell/SystemUsage/SystemUsage.tsx` (data-driven series colour, allowed).
