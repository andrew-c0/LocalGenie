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
import { deleteFile, downloadFile } from "./services/download";
import * as geniex from "./services/geniex";
import { useDownloadStore } from "./stores/downloadStore";
import type { ReleaseAsset } from "./types";
import { makeToast } from "./utils/toast";

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
    (repoId: string) => {
      setDownloading((prev) => new Set(prev).add(repoId));
      useDownloadStore.getState().upsert({ id: repoId, label: repoId });
      geniex
        .pullModel(repoId)
        .then(() => dispatchToast(makeToast("Download started", repoId), { intent: "success" }))
        .catch((err) => {
          useDownloadStore.getState().setStatus(repoId, "error", String(err));
          dispatchToast(makeToast("Pull failed", String(err)), { intent: "error" });
        })
        .finally(() => finishDownload(repoId));
    },
    [dispatchToast, finishDownload],
  );

  /** Download a specific release asset zip, then pull it into the GenieX cache. */
  const handleDownloadAsset = useCallback(
    (repoId: string, asset: ReleaseAsset, precision: string) => {
      setDownloading((prev) => new Set(prev).add(repoId));

      // GGUF assets point at a standalone HF repo (e.g. unsloth/...-GGUF);
      // `geniex pull --local-path` rejects bare .gguf files. Prefer pulling
      // the qualcomm model straight from AI Hub; if the chipset has no AI
      // Hub build for it, pull the linked GGUF's source repo from HF (the
      // CLI fetches the same file the link points to).
      const isGguf = asset.download_url.toLowerCase().endsWith(".gguf");
      if (isGguf) {
        const fail = (err: unknown) =>
          dispatchToast(makeToast("Pull failed", String(err)), { intent: "error" });
        const succeed = (name: string) =>
          dispatchToast(makeToast("Download complete", name), { intent: "success" });

        geniex
          .pullModel(repoId, precision, "aihub")
          .then(() => {
            succeed(repoId);
            finishDownload(repoId);
          })
          .catch(() => {
            // No AI Hub build for this chipset — pull the linked GGUF's
            // source repo from HF instead.
            const m = asset.download_url.match(/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//);
            const sourceRepo = m?.[1];
            if (!sourceRepo) {
              fail("Cannot resolve the GGUF source repository.");
              finishDownload(repoId);
              return;
            }
            geniex
              .pullModel(sourceRepo, precision, "hf")
              .then(() => succeed(sourceRepo))
              .catch(fail)
              .finally(() => finishDownload(repoId));
          });
        return;
      }

      const fileName = asset.download_url.split("/").pop() || "model.zip";
      let zipPath: string | null = null;
      const dlStore = useDownloadStore.getState();
      dlStore.upsert({ id: fileName, label: fileName, url: asset.download_url });
      downloadFile(asset.download_url, fileName)
        .then((localPath) => {
          dlStore.setStatus(fileName, "complete");
          zipPath = localPath;
          return geniex.pullModel(repoId, precision, "localfs", undefined, localPath);
        })
        .then(() => {
          // The CLI copied the model into its cache — delete the zip to
          // avoid double disk usage. Best-effort; ignore failures.
          if (zipPath) deleteFile(zipPath).catch(() => undefined);
          dispatchToast(makeToast("Download complete", repoId), { intent: "success" });
        })
        .catch((err) => {
          const msg = String(err);
          if (msg.includes("cancelled")) dlStore.setStatus(fileName, "cancelled");
          else dlStore.setStatus(fileName, "error", msg);
          dispatchToast(makeToast("Pull failed", msg), { intent: "error" });
        })
        .finally(() => finishDownload(repoId));
    },
    [dispatchToast, finishDownload],
  );

  return (
    <HubModelDetail
      onDownload={handleDownload}
      onDownloadAsset={handleDownloadAsset}
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
