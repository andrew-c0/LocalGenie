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
   - Routes only in `Navigation.tsx`. `App.tsx` stays scaffolding; startup and global listeners live in `components/AppBootstrap.tsx`.
   - Tauri calls only in `src/services/`. Components and hooks import from services, never from `@tauri-apps/*` directly.
4. Reuse before writing:
   - `components/ui/`: `SurfaceCard`, `MetricCard`, `StatusBadge`, `ProgressBar`, `StateBlock`, `ChipRow`, `ConfirmDialog`, `ErrorBanner`, `ModelCard`, `PageHeader`, `MarkdownContent`.
   - `utils/format.ts` for formatting, `utils/toast.tsx` and `useAppToast` for toasts.
   - `hooks/index.ts`: `useTauriEvent` (subscribes once per event name), `useDebouncedCallback`.
   - `stores/downloadStore.ts`: `startGGUFDownload` and `isDownloadActive`. The download flow lives there.
5. Styling: Fluent `makeStyles` with `tokens`, for layout. No inline `style` props except for values that come from data (for example a computed height). Colours come from Fluent tokens.
6. Derive state instead of mirroring it in an effect. Keep server state in the store, not in a component ref.

## Anti-patterns
- Business logic, Tauri listeners or bootstrap effects in `App.tsx`.
- `invoke()` or `listen()` in a component.
- Effects that copy props or store values into local state.
- Two sources of truth for one value (for example a port in two places).
- Re-inlined markup that a `ui/` component already provides.
- Non-trivial JSX inside `.map()` instead of a per-item component.
- Custom navigation: `window.location` or history wrappers.
