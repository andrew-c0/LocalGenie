import { useCallback, useEffect, useState } from "react";
import { useTauriEvent } from "../../../hooks";
import { useOnlineStatus } from "../../../hooks/useOnlineStatus";
import { cancelDownload } from "../../../services/download";
import { RUNTIME_PROGRESS_EVENT } from "../../../services/runtimes";
import {
  importTargetOf,
  pipelineQueueOf,
  runtimeDownloadId,
  useDownloadStore,
} from "../../../stores/downloadStore";
import type { RuntimeInstallProgress } from "../../../types";
import { installStepOf, type SpeedSample, sampleSpeed } from "../../../utils/runtimeInstall";
import { runtimeStageLabel } from "../../../utils/runtimeProgress";
import { refreshModelList } from "../../../utils/runtimeUsage";
import { toast } from "../../../utils/toast";
import {
  refreshAfterImport,
  runAihubDownload,
  runGGUFDownload,
  runRuntimeInstall,
} from "./downloadPipeline";
import { useDownloadAutoRetry } from "./useDownloadAutoRetry";

/** Last speed sample per runtime entry, so each progress event gives a bytes-per-second figure. */
const runtimeSpeeds = new Map<string, SpeedSample>();

/**
 * Owns the download pipeline while the drawer is mounted (the header keeps it mounted for the
 * whole app session). It starts queued entries, maps backend events onto the download store,
 * retries failed downloads that hit a network error, and exposes cancel/remove actions for the drawer UI.
 */
export function useDownloadManager() {
  const downloads = useDownloadStore((s) => s.downloads);
  const upsert = useDownloadStore((s) => s.upsert);
  const patchProgress = useDownloadStore((s) => s.patchProgress);
  const setStatus = useDownloadStore((s) => s.setStatus);
  const setImportingProgress = useDownloadStore((s) => s.setImportingProgress);
  const remove = useDownloadStore((s) => s.remove);
  const clearFinished = useDownloadStore((s) => s.clearFinished);
  const online = useOnlineStatus();
  /** Entries with a cancel request in flight. */
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  useDownloadAutoRetry(online);

  // Start every entry the app has queued. Runs on each store change; the pipeline's own status
  // check makes a repeat call for the same entry a no-op.
  useEffect(() => {
    for (const d of pipelineQueueOf(downloads)) {
      if (d.aihub) void runAihubDownload(d.aihub);
      else if (d.variant) void runGGUFDownload(d.variant);
      else if (d.runtime) void runRuntimeInstall(d.runtime);
    }
  }, [downloads]);

  /** Moves a running entry into its import (or install) step with a message. Other entries are left alone. */
  const enterImport = (id: string, message: string) => {
    if (useDownloadStore.getState().downloads.find((d) => d.id === id)?.status === "downloading") {
      setStatus(id, "importing");
    }
    setImportingProgress(id, message);
  };

  // Model import (GenieX cache registration) progress. The import is keyed by the model's repo id; an
  // OCR model imported by the Playground is shown on its own entry (see `importTargetOf`).

  useTauriEvent<{ model: string }>("model-pull-start", (payload) => {
    const target = importTargetOf(useDownloadStore.getState().downloads, payload.model);
    if (target) {
      setStatus(target, "importing");
      return;
    }
    upsert({ id: payload.model, label: payload.model });
    setStatus(payload.model, "importing");
  });

  useTauriEvent<{ model: string; message: string }>("model-pull-progress", (payload) => {
    const target = importTargetOf(useDownloadStore.getState().downloads, payload.model);
    setImportingProgress(target ?? payload.model, payload.message);
  });

  useTauriEvent<{ model: string }>("model-pull-complete", (payload) => {
    const downloads = useDownloadStore.getState().downloads;
    const target = importTargetOf(downloads, payload.model) ?? payload.model;
    const isAihub = downloads.some((d) => d.id === target && d.aihub);
    setStatus(target, "finished");
    toast.success("Model ready", `${payload.model} is imported and available to load.`);
    // The Rust import writes the AI Hub model's row itself, so only the library list refreshes.
    if (isAihub) void refreshModelList();
    else void refreshAfterImport(payload.model);
  });

  // File download progress, keyed by download id (= repo id).
  useTauriEvent<{
    id: string;
    file: string;
    received?: number;
    total?: number | null;
    speed?: number;
    complete?: boolean;
    cancelled?: boolean;
  }>("download-progress", (payload) => {
    if (payload.cancelled) {
      setStatus(payload.id, "cancelled");
      return;
    }
    if (payload.complete) {
      // Record the final size so the bar reads 100%; the import status arrives via model-pull-start.
      const existing = useDownloadStore.getState().downloads.find((d) => d.id === payload.id);
      if (existing && payload.total == null) {
        const finalSize = payload.received ?? existing.received;
        patchProgress(payload.id, finalSize, finalSize, 0);
      }
      return;
    }
    if (!useDownloadStore.getState().downloads.some((d) => d.id === payload.id)) {
      upsert({ id: payload.id, label: payload.id, status: "downloading" });
    }
    patchProgress(payload.id, payload.received ?? 0, payload.total ?? null, payload.speed ?? 0);
  });

  // Runtime install or update progress, keyed by runtime id. Every runtime reports it the same way.
  useTauriEvent<RuntimeInstallProgress>(RUNTIME_PROGRESS_EVENT, (payload) => {
    const id = runtimeDownloadId(payload.id);
    const step = installStepOf(payload.stage);
    if (step === "download") {
      const sample = sampleSpeed(runtimeSpeeds.get(id), payload.received, Date.now());
      runtimeSpeeds.set(id, sample);
      patchProgress(id, payload.received, payload.total > 0 ? payload.total : null, sample.speed);
    } else if (step === "import") {
      enterImport(id, runtimeStageLabel(payload.stage));
    } else {
      // Done or error: the invoke result sets the entry's status, so only the speed state ends here.
      runtimeSpeeds.delete(id);
    }
  });

  const cancel = useCallback(async (id: string) => {
    setCancelling((prev) => new Set(prev).add(id));
    try {
      await cancelDownload(id).catch(() => undefined);
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  return { downloads, cancelling, online, cancel, remove, clearFinished };
}
