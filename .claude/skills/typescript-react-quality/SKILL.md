---
name: typescript-react-quality
description: TypeScript and React quality workflow for LocalGenie's frontend. Use when writing, reviewing or refactoring anything under src/ (components, pages, hooks, zustand stores, services, routes, styling), or before declaring such a change done.
---

# TypeScript and React quality (LocalGenie frontend)

## Procedure
1. Type check: `npx tsc --noEmit`. No `any`, no `as` casts to silence errors. Narrow `unknown`, or use types from `src/types/index.ts`.
2. Lint: `node_modules/.bin/biome check src`. Format with `node_modules/.bin/biome check --write src`. Project rules that matter most:
   - `useImportType`: `import type` for type-only imports.
   - `useExhaustiveDependencies`: fix dependency arrays. Do not add `useMemo` or `useCallback` without a real cost.
   - `useHookAtTopLevel`: no hook after an early return.
   - `noNonNullAssertion`, `noExplicitAny`, `noUnusedImports`, `noUnusedVariables`.
   - `useSemanticElements`: use `fieldset` for a group, not `role="group"` on a `div`.
3. Structure:
   - One component per file, in a folder when it has shared UI (`components/ui/ChipRow/ChipRow.tsx`).
   - At most six `useState` calls per component. Past that, extract a hook or split the component.
   - Routes only in `Navigation.tsx`. `App.tsx` stays scaffolding; `components/AppBootstrap.tsx` only runs one-time startup loads.
   - Each domain owns its side effects: downloads and their Tauri events in `components/shell/DownloadDrawer/`, model loading in `components/shell/Header/useModelLoader.ts`, chat streaming and session saves in `components/chat/ChatRuntime/`. Other components read the stores.
   - Tauri calls only in `src/services/`. Components and hooks import from services, never from `@tauri-apps/*` directly.
4. Reuse before writing:
   - `components/ui/`: `SurfaceCard`, `MetricCard`, `StatusBadge`, `ProgressBar`, `StateBlock`, `ChipRow`, `ConfirmDialog`, `ErrorBanner`, `ModelCard`, `PageHeader`, `MarkdownContent`, `Flex`, `Typography`, `OptionDropdown`.
   - `utils/format.ts` for formatting; `toast` from `utils/toast.ts` for user-awaited outcomes (not background loads).
   - `hooks/index.ts`: `useTauriEvent` (subscribes once per event name).
   - `stores/downloadStore.ts`: state only. Request a download with `enqueue(variant)`; `DownloadDrawer` runs the pipeline. `isDownloadActive` is the status check.
5. Styling: a stylesheet beside the component, `Name/Name.tsx` + `Name/Name.css` (or `.scss`), used only by that component. No `makeStyles` and no inline `style` props, except a value that comes from data. Colours and spacing come from Fluent tokens as CSS variables (`var(--spacingVerticalS)`, `var(--colorNeutralStroke2)`). Layout goes through `Flex` and text through `Typography`. No layout classes on Fluent components. Override Fluent's styles only with a scoped selector (`.model-selector .model-option`), and use a grid where flex sizing of a Fluent Button fails. A component with its own styling is a folder `Name/` holding `Name.tsx` and `Name.css`. The visual rules are in `.claude/agents/react-expert.md`.
6. Derive state instead of mirroring it in an effect. Keep server state in the store, not in a component ref.

## Anti-patterns
- Business logic, Tauri listeners or bootstrap effects in `App.tsx`.
- `invoke()` or `listen()` in a component.
- Effects that copy props or store values into local state.
- Two sources of truth for one value (for example a port in two places).
- Re-inlined markup that a `ui/` component already provides.
- Non-trivial JSX inside `.map()` instead of a per-item component.
- Custom navigation: `window.location` or history wrappers.
