import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MainLayout } from "./components/shell/Layouts";
import BenchmarkPlayground from "./pages/benchmark/BenchmarkPlayground";
import PerformanceDashboard from "./pages/benchmark/PerformanceDashboard";
import ChatPage from "./pages/ChatPage";
import LocalModelsBrowserPage from "./pages/LocalModelsBrowserPage";
import HubModelDetail from "./pages/models/HubModelDetail";
import OverviewPage from "./pages/OverviewPage";
import PromptBenchmarkPage from "./pages/PromptBenchmarkPage";
import SettingsPage from "./pages/SettingsPage";
interface HubModelDetailRouteState {
  isLocal?: boolean;
}

/** Narrow `useLocation().state` to `HubModelDetailRouteState | null`. */
function readRouteState(state: unknown): HubModelDetailRouteState | null {
  if (!state || typeof state !== "object") return null;
  return state as HubModelDetailRouteState;
}

/**
 * Route wrapper for the HF model detail page — shares pull handling with the library.
 */
function HubModelDetailRoute() {
  const [downloading] = useState<Set<string>>(new Set());
  const location = useLocation();
  // Single source of truth: the card that opened this route already decided
  // whether the model is local (`isLocal` prop) and passed it via navigation
  // state. The route is a pure pass-through — it must NOT recompute this from
  // the database, otherwise an HF search result sharing a repo id with a
  // locally installed model would be wrongly treated as local.
  const state = readRouteState(location.state);
  const [isLocal, setIsLocal] = useState(state?.isLocal === true);
  useEffect(() => {
    setIsLocal(state?.isLocal === true);
  }, [state?.isLocal]);
  return <HubModelDetail downloading={downloading} isLocal={isLocal} />;
}

/**
 * Single source of truth for the route tree. All route definitions live here;
 * `App.tsx` only mounts providers, global listeners and this component.
 */
export default function Navigation() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/models" element={<LocalModelsBrowserPage />} />
        <Route path="/models/:repoId" element={<HubModelDetailRoute />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/benchmark" element={<Navigate to="/prompt-benchmark" replace />} />
        <Route path="/prompt-benchmark" element={<PromptBenchmarkPage />}>
          <Route index element={<Navigate to="playground" replace />} />
          <Route path="playground" element={<BenchmarkPlayground />} />
          <Route path="dashboard" element={<PerformanceDashboard />} />
        </Route>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
