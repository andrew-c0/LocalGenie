# Fluent UI migration: status and handoff

Goal: all UI uses Fluent UI v9 components. Custom styling is avoided unless a colour is missing from the Fluent palette, in which case a shared component is created or reused. `makeStyles` is for layout only.

Status: UI migration is complete except for the items under "Open items". Nothing is committed. Working tree changes are uncommitted and many files show as modified, likely from CRLF line endings; check line endings before committing.

## Done

**Foundation**
- Theme: Fluent stock `webDarkTheme`, set in `src/main.tsx`. `src/theme.ts` deleted.
- `src/App.css` deleted and its import removed from `src/main.tsx`. No `lx-*` class names remain in `src/`.
- Global reset in `src/App.tsx` (`makeStaticStyles`): `html, body, #root` get `margin: 0`, `padding: 0`, `height: 100%`. This removes the browser's default 8px body margin.
- `src/main.tsx` order: `FluentProvider` wraps `ErrorBoundary`, so the fallback is themed.

**Shell** (`src/components/shell/`): `Layouts`, `Sidebar` (vertical `TabList`), `Header`, `ModelSelectorPopover`, `ModelOptionButton`, `DownloadDrawer` (Fluent `Drawer`), `DownloadItemCard`, `DownloadStatusBadge`.

**Shared primitives**
- `src/components/ui/primitives.tsx`: `SurfaceCard`, `MetricCard`, `StatusBadge` (`BadgeTone`), `ProgressBar` (0–100), `StateBlock`.
- `src/components/ui/`: `ChipRow`, `ConfirmDialog`, `ErrorBanner`, `PageHeader`, `ModelCard`, `MarkdownContent`.
- `src/components/ErrorFallback.tsx`, used by `ErrorBoundary`.

**Pages**
- Overview (`src/pages/OverviewPage.tsx`).
- Settings (`src/pages/SettingsPage.tsx`, `AppSettings`, `ModelSettings`).
- Model library (`LocalModelsBrowserPage`, `HubModelBrowser`, `HubModelDetail`).
- Chat (`ChatPage`, `ChatArea`, `MessageBubble`, `ChatInput`, `ChatContextHeader`, `SessionList`).
- Benchmark suite (`PromptBenchmarkPage` with vertical `TabList`; `BenchmarkPlayground`; `PerformanceDashboard`). `ThroughputChart` uses Fluent palette tokens. `SpeedList` is Fluent-only. Benchmark is not functional yet (the user's call).
- `TelemetryValues` is split into `src/components/benchmark/TelemetryValues.tsx`. Hardware metrics (memory bandwidth, SoC thermals) show N/A until backend telemetry exists.
- Playground "Save Preset" is disabled with a tooltip. Presets have no storage yet.

**Verification**
- `npx tsc --noEmit` passes.
- Biome (scratch install at `$HOME/biome-tool`, config `biome.json`) is clean on the converted Phase 3 files. Formatting and import-order safe fixes were applied across `src/`.

**Knowledge files**
- `CLAUDE.md`, `memories/repo/codebase-map.md`, `memories/repo/known-issues.md`, and `memories/repo/project-overview.md` are updated for the removed `App.css`, the Fluent-only styling, and the direct Hugging Face download plus local import flow.
- `.claude/agents/knowledge-sync.md` exists but has not been run yet.

## Open items

1. **Per-response stats line is not persisted.** `MessageBubble` renders time to first token, total time, token count, tok/s, and prompt chars under each assistant reply. The values are set in `AppBootstrap.tsx` on `chat-done` and kept only in memory. `src-tauri` `message` entity and `save_message` have no stats columns, so the line disappears when a session is reopened. The user has not yet confirmed whether this is the element they meant. If it is, add nullable columns to the `messages` entity, a sea-orm migration, update `save_message` and the loader, and map them back into `Message.stats` in `src/services/database.ts`.
2. **Page padding.** Pages use `spacingHorizontalL` (16px) or `spacingVerticalXL` padding (for example `OverviewPage.tsx`, `SettingsPage.tsx`, `PromptBenchmarkPage.tsx`, `LocalModelsBrowserPage.tsx`, `HubModelDetail.tsx`, `ChatArea.tsx`). The user has not decided whether to remove these. No `1.5rem` value exists in `src/`; if one is still visible in the app, trace it at runtime.
3. **Biome: resolved.** `node_modules/.bin/biome check src` is clean (58 files), as is `npx tsc --noEmit`. The `role="group"` containers are now `fieldset` with reset styles, the `isLocal` dependency is added, `noExplicitAny` is fixed, and the useless switch cases are removed. Run with the project's local Biome (`node_modules/.bin/biome`).
4. **`HubModelDetail.tsx` state: resolved.** Data loading lives in `src/pages/models/useHubModelDetail.ts` (`useHubModelData`, `useDownloadedPrecisions`, `useSystemMemory`). GGUF grouping lives in `src/services/hubModels.ts` (merged with `listGGUFFiles`). The component keeps 3 `useState` calls. The variant selection is keyed by repo id, so it needs no reset effect. Behaviour change: the file list is fetched once instead of twice.
5. **Runtime not verified.** Nothing has been run with `npm run dev` since the UI changes. Check every page, the chat stream, the download drawer, and the model selector at phone and desktop widths.
6. **Benchmark is not functional.** Dashboard "Export" is disabled. "Run Benchmark" only toggles visual state. The Playground's "Total Time" and "Power Draw" are gone; the TTFT and throughput tiles come from live streaming only.
7. **Syntax highlighting.** `rehype-highlight` is wired in `MarkdownContent` only when `allowHtml` is true, and no highlight.js theme is imported, so code blocks in model cards are unstyled.
8. **Stale docs.** `.github/` (user-owned) still describes hub pulls in places. The `lx-badge` example in `memories/repo/code-quality.md` is updated.
9. **Knowledge sync.** Run the `knowledge-sync` agent after these changes to refresh the remaining references and confirm `.claude/knowledge-sync.state`.
10. **Git.** Commit only when asked. Confirm line endings (CRLF vs LF) for the modified files so the diff reflects real changes.

## Conventions to keep

- Tauri `invoke()` only in `src/services/`. Routes only in `src/Navigation.tsx`. One component per file. At most six `useState` per component. `import type` for types. No `any`.
- Fluent components first. `makeStyles` for layout only. New colours come from Fluent tokens, not hard-coded values.
