import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "./components/shell/Layouts";
import BenchmarkPlayground from "./pages/benchmark/BenchmarkPlayground";
import PerformanceDashboard from "./pages/benchmark/PerformanceDashboard";
import ChatPage from "./pages/ChatPage";
import LocalModelsBrowserPage from "./pages/LocalModelsBrowserPage";
import HubModelDetailRoute from "./pages/models/HubModelDetailRoute";
import OverviewPage from "./pages/OverviewPage";
import PromptBenchmarkPage from "./pages/PromptBenchmarkPage";
import SettingsPage from "./pages/SettingsPage";

/**
 * Single source of truth for the route tree. All route definitions live here;
 * `App.tsx` only mounts providers, global listeners and this component.
 *
 * Submenus are sub-routes, so each view has its own URL:
 * - `/models` local library, `/models/browse` Hugging Face browser, `/models/:repoId` detail
 * - `/chat` default content, `/chat/:sessionId` one conversation
 * - `/settings/:section`
 * - `/prompt-benchmark/playground|dashboard` (benchmark area)
 */
export default function Navigation() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/models" element={<LocalModelsBrowserPage tab="local" />} />
        <Route path="/models/browse" element={<LocalModelsBrowserPage tab="all" />} />
        <Route path="/models/:repoId" element={<HubModelDetailRoute />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/benchmark" element={<Navigate to="/prompt-benchmark" replace />} />
        <Route path="/prompt-benchmark" element={<PromptBenchmarkPage />}>
          <Route index element={<Navigate to="playground" replace />} />
          <Route path="playground" element={<BenchmarkPlayground />} />
          <Route path="dashboard" element={<PerformanceDashboard />} />
        </Route>
        <Route path="/settings" element={<Navigate to="/settings/app" replace />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
