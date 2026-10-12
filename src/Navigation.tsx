import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "./components/shell/Layouts";
import BenchmarkPlayground from "./pages/benchmark/BenchmarkPlayground";
import PerformanceDashboard from "./pages/benchmark/PerformanceDashboard";
import ChatPage from "./pages/ChatPage";
import ModelLibraryPage from "./pages/ModelLibraryPage";
import HubModelDetail from "./pages/models/HubModelDetail";
import OverviewPage from "./pages/OverviewPage";
import PromptBenchmarkPage from "./pages/PromptBenchmarkPage";
import SettingsPage from "./pages/SettingsPage";

/** Route wrapper for the HF model detail page — shares pull handling with the library. */
function HubModelDetailRoute() {
  const [downloading] = useState<Set<string>>(new Set());

  return <HubModelDetail downloading={downloading} />;
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
        <Route path="/models" element={<ModelLibraryPage />} />
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
