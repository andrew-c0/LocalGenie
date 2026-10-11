import { useCallback, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "./components/shell/Layouts";
import { useAppToast } from "./hooks";
import BenchmarkPlayground from "./pages/benchmark/BenchmarkPlayground";
import PerformanceDashboard from "./pages/benchmark/PerformanceDashboard";
import ChatPage from "./pages/ChatPage";
import ModelLibraryPage from "./pages/ModelLibraryPage";
import HubModelDetail from "./pages/models/HubModelDetail";
import OverviewPage from "./pages/OverviewPage";
import PromptBenchmarkPage from "./pages/PromptBenchmarkPage";
import SettingsPage from "./pages/SettingsPage";
import * as geniex from "./services/geniex";
import { useDownloadStore } from "./stores/downloadStore";
import { makeToast } from "./utils/toast";
import { GGUFFile } from "./services/hubModels";

/** Route wrapper for the HF model detail page — shares pull handling with the library. */
function HubModelDetailRoute() {
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const { dispatchToast } = useAppToast();

  const finishDownload = useCallback((repoId: string) => {
    setDownloading((prev) => {
      const next = new Set(prev);
      next.delete(repoId);
      return next;
    });
  }, []);

  const handleDownload = useCallback(
    (repoId: string, variant?: GGUFFile) => {
      setDownloading((prev) => new Set(prev).add(repoId));
      useDownloadStore.getState().upsert({ id: repoId, label: repoId });
      geniex
        .importGGUF(repoId, variant?.filename ?? "", variant?.precision ?? "")
        .then(() => dispatchToast(makeToast("Download started", repoId), { intent: "success" }))
        .catch((err) => {
          useDownloadStore.getState().setStatus(repoId, "error", String(err));
          dispatchToast(makeToast("Pull failed", String(err)), { intent: "error" });
        })
        .finally(() => finishDownload(repoId));
    },
    [dispatchToast, finishDownload],
  );

  return (
    <HubModelDetail
      onDownload={handleDownload}
      downloading={downloading}
    />
  );
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
