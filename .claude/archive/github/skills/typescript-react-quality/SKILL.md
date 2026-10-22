---
name: typescript-react-quality
description: 'TypeScript & React code quality workflow for LocalGenie frontend. Use when: reviewing, refactoring, or writing React components/hooks/stores; fixing type errors; enforcing biome lint rules; checking hook dependencies and a11y before finishing frontend work.'
---

# TypeScript & React Code Quality

## When to Use
- Before declaring any frontend change done
- Reviewing or refactoring components, hooks, or zustand stores
- Fixing type errors or lint warnings in `src/`

## Procedure

1. **Type check**: run `npm run check` (tsc --noEmit). Fix all errors; no `any` escapes — use `unknown` + narrowing or proper types from `src/types/index.ts`.
2. **Lint**: run `npm run lint` (biome). Project rules that matter most:
   - `useImportType` (error): use `import type` for type-only imports.
   - `useConst` (error), `noUnusedImports`/`noUnusedVariables` (warn): clean up.
   - `useExhaustiveDependencies` (warn): fix hook dependency arrays; prefer `useMemo`/`useCallback` only where there's a real cost, not reflexively.
   - `useHookAtTopLevel` (error): never conditional hooks.
   - `noNonNullAssertion` (warn): avoid `!`; narrow instead.
   - `noExplicitAny` (warn).
3. **React patterns**:
   - Components: functional only; props typed with an explicit interface.
   - State: zustand stores in `src/stores/`; selectors to avoid unnecessary re-renders.
   - IPC: keep `invoke()` calls in `src/services/`; type the return values.
   - Styling: FluentUI v9 `makeStyles` + `tokens`; reuse `src/components/ui/primitives.tsx`.
4. **File & component structure rules** (enforce these):
   - **One component per file.** Never export multiple components from one file.
   - **One class/enum/model per file.** Types, interfaces, enums, and models each get their own file — except a component's own props interface, which lives with the component.
   - **Max 6 `useState` hooks per component.** If a component needs more, extract a custom hook (e.g., `useAccordionState.ts` next to the component) or split the component. Prefer deriving state or consolidating related values into a single state object before adding a 7th hook.
   - **Component-specific styling lives next to the component.** For a component `Accordion`, create a folder `Accordion/` containing `Accordion.tsx` and `Accordion.css` (or `.scss`). That stylesheet is used only by that component — no shared/global styles in it. Shared styling goes to FluentUI tokens/primitives instead.
   - **Every component with its own stylesheet lives in a named folder.** `components/ui/ChipRow/ChipRow.tsx` + `ChipRow.css`, `components/chat/SessionList/SessionList.tsx` + `SessionList.css`, etc. Components without dedicated styles may sit directly in their domain folder (`components/models/HubBrowse.tsx`). Import the component by its full folder path (`ui/ChipRow/ChipRow`).
   - **`App.tsx` is pure scaffolding.** It may only contain top-level wrappers: providers, state wrappers, and the app shell (router + toaster). No business logic, no app logic, no bootstrap effects, no Tauri listeners, no route definitions, no page-level logic. All bootstrap logic (data loading, global event listeners, persistence) goes into a dedicated wrapper component (e.g., `components/AppBootstrap.tsx`) that `App.tsx` composes; all routes go into `Navigation.tsx`.
5. **Reuse & deduplication** (check before writing anything new):
   - **Formatting helpers**: use `src/utils/format.ts` (`shortName`, `formatCount`, `formatBytes`, `formatDuration`, `formatTokPerSec`). Never define a local copy of these.
   - **Toast helpers**: `useAppToast` from `src/hooks` and `makeToast` from `src/utils/toast.tsx` — don't build toast elements inline.
   - **Reusable hooks**: `src/hooks/index.ts` (`useTauriEvent`, `useDebouncedCallback`, `useAppToast`). Add new reusable hooks there, not inside component files.
   - **Shared UI components** in `src/components/ui/`: `primitives.tsx` (`SurfaceCard`, `MetricCard`, `StatusBadge`, `ProgressBar`, `StateBlock`), `ChipRow`, `ConfirmDialog`, `ErrorBanner`, `ModelCard`, `PageHeader`. Use them instead of re-inlining the same markup; extract a new shared component when the same block appears in 2+ places.
   - **Render loops**: when mapping over a list with non-trivial per-item markup, extract a per-item component (e.g., `ModelCard`) instead of inlining the JSX in the `.map()`.
6. **Format**: run `npm run format` if formatting drifted (2-space indent, double quotes, semicolons, 100 col width).
7. **Verify**: re-run `npm run check` and `npm run lint` — zero new errors/warnings.

## Anti-patterns
- Business logic, bootstrap effects, or Tauri listeners in `App.tsx` — it must stay pure scaffolding
- Raw `invoke()` scattered in components
- `any` or non-null assertions to silence the compiler
- Effects that duplicate derived state — derive instead
- New dependencies for problems the existing stack solves
- Multiple components or multiple exported types in one file
- 7+ `useState` hooks in a single component
- Component styles placed in a global stylesheet or inline `style` props where a component stylesheet belongs
- Duplicated local format/toast helpers instead of `src/utils/format.ts` / `src/utils/toast.tsx`
- Re-inlined markup for chips, error banners, confirm dialogs, model cards, or page headers instead of the shared `ui/` components
- Non-trivial per-item JSX inlined inside `.map()` instead of a per-item component
- Custom navigation (manual `window.location`, history wrappers) — React Router hooks only
