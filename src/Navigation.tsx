import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "./components/shell/Layouts/Layouts";
import BenchmarkPage from "./pages/BenchmarkPage/BenchmarkPage";
import BenchmarkCompare from "./pages/benchmark/BenchmarkCompare/BenchmarkCompare";
import BenchmarkPrompts from "./pages/benchmark/BenchmarkPrompts/BenchmarkPrompts";
import BenchmarkRun from "./pages/benchmark/BenchmarkRun/BenchmarkRun";
import BenchmarkRuns from "./pages/benchmark/BenchmarkRuns/BenchmarkRuns";
import BenchmarkSuites from "./pages/benchmark/BenchmarkSuites/BenchmarkSuites";
import ChatPage from "./pages/ChatPage/ChatPage";
import LocalModelsBrowserPage from "./pages/LocalModelsBrowserPage/LocalModelsBrowserPage";
import AihubModelDetail from "./pages/models/AihubModelDetail/AihubModelDetail";
import HubModelDetailRoute from "./pages/models/HubModelDetailRoute";
import OverviewPage from "./pages/OverviewPage/OverviewPage";
import PlaygroundPage from "./pages/PlaygroundPage/PlaygroundPage";
import SettingsPage from "./pages/SettingsPage/SettingsPage";

/**
 * Single source of truth for the route tree. All route definitions live here;
 * `App.tsx` only mounts providers, global listeners and this component.
 *
 * Submenus are sub-routes, so each view has its own URL:
 * - `/models` local library, `/models/browse` Hugging Face browser, `/models/aihub` Qualcomm AI Hub
 *   catalog, `/models/aihub/:id` its detail, `/models/:repoId` Hugging Face detail
 * - `/chat` default content, `/chat/:sessionId` one conversation
 * - `/playground` special models that need their own tools (scaffold)
 * - `/settings/:section`
 * - `/benchmarks/prompts|suites|run|runs|compare` (benchmark area)
 */
export default function Navigation() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/models" element={<LocalModelsBrowserPage tab="local" />} />
        <Route path="/models/browse" element={<LocalModelsBrowserPage tab="all" />} />
        <Route path="/models/aihub" element={<LocalModelsBrowserPage tab="aihub" />} />
        <Route path="/models/aihub/:id" element={<AihubModelDetail />} />
        <Route path="/models/:repoId" element={<HubModelDetailRoute />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/benchmarks" element={<BenchmarkPage />}>
          <Route index element={<Navigate to="prompts" replace />} />
          <Route path="prompts" element={<BenchmarkPrompts />} />
          <Route path="suites" element={<BenchmarkSuites />} />
          <Route path="run" element={<BenchmarkRun />} />
          <Route path="runs" element={<BenchmarkRuns />} />
          <Route path="compare" element={<BenchmarkCompare />} />
        </Route>
        <Route path="/benchmark" element={<Navigate to="/benchmarks" replace />} />
        <Route path="/prompt-benchmark/*" element={<Navigate to="/benchmarks" replace />} />
        <Route path="/settings" element={<Navigate to="/settings/app" replace />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
