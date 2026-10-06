# LocalGenie project overview

## What it is
LocalGenie is a Tauri 2 desktop client for Qualcomm GenieX local inference. It wraps a local GenieX server and gives users a desktop UI for browsing models, starting a server, loading models, and chatting with them.

## Stack
- Frontend: React 19, TypeScript, Fluent UI v9, Zustand
- Backend: Rust + Tauri 2
- Persistence: SQLite via sea-orm
- Runtime: local GenieX CLI process with an OpenAI-compatible HTTP API

## Core flow
1. User starts or configures the local GenieX server.
2. User browses available models and pulls/removes them.
3. User loads a model through the server.
4. User chats with streaming responses.
5. Session and settings data are persisted locally.
6. User is notified of GenieX CLI updates via a badge on the sidebar settings button; updates run through the App Settings drawer (installer download + launch + version polling).

## Current state
- Most app shell and session flows work.
- Model loading and chat completion are currently blocked by the GenieX warmup/server response issue.
- The server port defaults to `18181` and is stored in `user_preferences`.
- Legacy `geniex` naming is still used where required by the external CLI.
- CLI update flow is installer-based (GitHub releases → app data dir → launch → poll); see `cli-update.md` and `manual-checklist.md`.

## Stitch UI conversion (2026-09-18)

The frontend was rebuilt to match the Stitch designs in `memories/ui/stitch_localgenie_design/` (NeuralStudio-style dark workspace, token source: `fluent_runtime/DESIGN.md`).

### Architecture
- `src/App.tsx` is pure scaffolding: `MemoryRouter` → `AppBootstrap` → `Navigation` + `Toaster`. No logic, effects, or listeners in it.
- `src/components/AppBootstrap.tsx` — all bootstrap logic: initial data load (CLI check, sessions, models, server status/port), global Tauri listeners (`chat-chunk`, `chat-done`, `server-stopped`, `model-pull-progress/complete`) via the `useTauriEvent` hook, and debounced session persistence. Listeners read the active session via `useChatStore.getState()` inside callbacks (not closures).
- `src/Navigation.tsx` — single source of truth for routes, including the `HubModelDetailRoute` wrapper (download/pull + toast handling) and nested `/prompt-benchmark` routes under a shared `MainLayout` route element.
- `src/components/shell/` — `Layouts.tsx` (`MainLayout`: Sidebar + `CliMissingBanner` + Header + `<Outlet />`), `Sidebar.tsx` (nav with active route, model-count badge, hardware footer), `Header.tsx` (titlebar with model selector trigger + status chips), `ModelSelectorPopover.tsx`.
- `src/pages/` — `OverviewPage`, `ModelLibraryPage` (composes `PageHeader`/`ChipRow`/`ErrorBanner`/`ModelCard`/`ConfirmDialog`), `ChatPage` (composes `SessionList` + `ChatContextHeader` + `ChatArea`/`ChatInput`), `SettingsPage` (composes `AppSettings` + `ModelSettings`; reads `updateInfo` from the store, no prop drilling), `PromptBenchmarkPage` (Benchmark Suite layout, nested routes). Benchmark subpages live in `src/pages/benchmark/`.
- `src/components/ui/` — shared components, each in its own folder with its CSS: `primitives.tsx` (`SurfaceCard`, `MetricCard`, `StatusBadge`, `ProgressBar`, `StateBlock`), `ChipRow/`, `ConfirmDialog/`, `ErrorBanner/`, `ModelCard/`, `PageHeader/`.
- `src/components/chat/` — `SessionList/`, `ChatContextHeader/`. `src/components/benchmark/` — `SpeedList/`, `ThroughputChart.tsx`.
- `src/hooks/index.ts` — reusable hooks: `useTauriEvent`, `useDebouncedCallback`, `useAppToast`.
- `src/utils/format.ts` — shared `shortName`, `formatCount`, `formatBytes`, `formatDuration`, `formatTokPerSec`. `src/utils/toast.tsx` — `makeToast`.
- `src/stores/benchmarkStore.ts` + `src/components/benchmark/ThroughputChart.tsx` (dependency-free SVG chart; `PAD` is a module-level const for stable `useMemo` deps).
- Design tokens: `--lx-*` CSS custom properties in `src/App.css` (`#131313` bg, `#0078D4` blue, `#00B7C3` cyan, `#8764B8` purple, 4/8px rhythm, responsive breakpoints at 1100/860/560px).

### Deleted legacy components
`WelcomeScreen`, `ModelBrowser`, `SettingsDrawer`, old `components/Sidebar`/`Header`, `ModelSelector`. Their CSS sections remain in `App.css` unused (cleanup optional).

### Data honesty
- `PromptBenchmarkPage` measures real TTFT/throughput via raw streaming fetch to `/v1/chat/completions` (route `/prompt-benchmark/playground`).
- `PerformanceDashboard` "Run Benchmark" is visual-only (no backend benchmark command exists).

### Benchmark Suite (2026-09-23)
- Single nav entry `Benchmarks` → `/prompt-benchmark`. Nested routes: `playground` (index redirects here) and `dashboard`, rendered via `<Outlet />` in `PromptBenchmarkPage` (Settings-style sub-menu layout).
- `/benchmark` redirects to `/prompt-benchmark`. Subpages reach each other via `navigate()`; the dashboard header has a "Back to Prompt Benchmark" button.
- `src/pages/BenchmarkPage.tsx` was deleted; its body became `src/pages/benchmark/PerformanceDashboard.tsx`.
- NPU/VRAM/thermals/bandwidth telemetry has no backend source — UI shows explicit "unavailable" states rather than fabricated values.
