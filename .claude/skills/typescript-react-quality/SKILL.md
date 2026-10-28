---
name: typescript-react-quality
description: TypeScript and React quality workflow for LocalGenie's frontend. Use when writing, reviewing or refactoring anything under src/ (components, pages, hooks, zustand stores, services, routes, styling), or before declaring such a change done. Covers SOLID, readable naming and TypeScript and React idioms.
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
7. Run the review checklist below on every changed component, hook, store and service.

## Review checklist

### SOLID and structure
- **Single responsibility:** a component renders, a hook owns state and effects, a store holds state, a service talks to Tauri. A component that fetches, transforms and renders is a split candidate.
- **Open/closed:** a new variant (source, status, facet) extends a union or a map entry, not a chain of `if` checks in several places.
- **Liskov:** a component that takes a variant of a prop (`ModelCard` with and without `onOpenSelector`) must behave correctly for every variant it accepts. Optional props must not change its meaning silently.
- **Interface segregation:** props are narrow. A component receives `downloading: Set<string>`, not the whole download store. A hook returns only what its callers read.
- **Dependency inversion:** components depend on service functions and store selectors, not on `invoke()` or the Tauri plugin. This makes the component testable with a mocked service.

### Readable names
- Components are nouns that name the thing shown (`ModelCard`, `DownloadDrawer`). Hooks start with `use` and name what they provide (`useAihubCatalog`, not `useData`).
- Event handlers read as actions: `handleSortSelect`, `openDetail`, `onOptionSelect`. Avoid `doIt`, `click1`, `onStuff`, `process`.
- Booleans are questions: `isLoading`, `isDownloading`, `hasMore`, `canRetry`. Not `loading`, `flag`, `status2`.
- Avoid generic names: `data`, `info`, `item`, `thing`, `temp`, `res`, `val`, `obj`, `utils`, `helpers`, `manager`, `common`. Name the domain: `aihubFacets`, `hubBrowseStore`, `downloadPipeline`.
- Map and filter callbacks use the item's name (`models.map((model) => …)`), not `x` or `i` unless the index is used.
- Types and interfaces are nouns (`HubModel`, `DownloadItem`). Union members name the case (`"queued" | "downloading" | "failed"`).
- If a name needs a comment to be understood, rename it first.

### TypeScript and React idioms that make code easier to read
- Prefer a discriminated union over a set of optional fields and booleans (`{ kind: "file"; path: string } | { kind: "url"; href: string }`).
- Prefer `const` and early returns over `let` and nested `if/else`. A function body stays under about 40 lines.
- No nested ternaries. Use a `switch` or a small lookup map.
- Exported functions have explicit return types. Internal arrow functions may leave them out.
- Use `satisfies` or a typed constant over `as` to keep type checking on literal data.
- Avoid `useEffect` for derived values or for reacting to a prop change that a render can compute.
- Keep JSX readable: a conditional branch longer than a few lines becomes an early return or a named sub-component. Non-trivial JSX inside `.map()` becomes a per-item component.
- Do not add comments that restate the code. Comments say why, or document a non-obvious constraint.
- Avoid barrel files (`index.ts` re-exports) that pull in unrelated modules, except `hooks/index.ts` which already exists.

## Anti-patterns
- Business logic, Tauri listeners or bootstrap effects in `App.tsx`.
- `invoke()` or `listen()` in a component.
- Effects that copy props or store values into local state.
- Two sources of truth for one value (for example a port in two places).
- Re-inlined markup that a `ui/` component already provides.
- Non-trivial JSX inside `.map()` instead of a per-item component.
- Custom navigation: `window.location` or history wrappers.
- A component that takes a boolean that switches between two unrelated layouts. Split it into two components, or use a variant union.
- Generic names from the list above, or abbreviations a new reader would have to look up.
