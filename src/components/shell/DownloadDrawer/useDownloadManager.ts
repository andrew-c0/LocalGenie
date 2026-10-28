import { useCallback, useEffect, useState } from "react";
import { useTauriEvent } from "../../../hooks";
import { cancelDownload } from "../../../services/download";
import { useDownloadStore } from "../../../stores/downloadStore";
import { toast } from "../../../utils/toast";
import {
  refreshAfterImport,
  refreshModelList,
  runAihubDownload,
  runGGUFDownload,
} from "./downloadPipeline";

/**
 * Owns the download pipeline while the drawer is mounted (the header keeps it mounted for the
 * whole app session). It starts queued entries, maps backend events onto the download store,
 * and exposes cancel/remove actions for the drawer UI.
 */
export function useDownloadManager() {
  const downloads = useDownloadStore((s) => s.downloads);
  const upsert = useDownloadStore((s) => s.upsert);
  const patchProgress = useDownloadStore((s) => s.patchProgress);
  const setStatus = useDownloadStore((s) => s.setStatus);
  const setImportingProgress = useDownloadStore((s) => s.setImportingProgress);
  const requeue = useDownloadStore((s) => s.requeue);
  const remove = useDownloadStore((s) => s.remove);
  const clearFinished = useDownloadStore((s) => s.clearFinished);
  /** Entries with a cancel request in flight. */
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  // Start every entry the app has queued. Runs on each store change; the pipeline's own status
  // check makes a repeat call for the same entry a no-op.
  useEffect(() => {
    for (const d of downloads) {
      if (d.status !== "queued") continue;
      if (d.aihub) void runAihubDownload(d.aihub);
      else if (d.variant) void runGGUFDownload(d.variant);
    }
  }, [downloads]);

  // Model import (GenieX cache registration) progress.
  useTauriEvent<{ model: string }>("model-pull-start", (payload) => {
    upsert({ id: payload.model, label: payload.model });
    setStatus(payload.model, "importing");
  });

  useTauriEvent<{ model: string; message: string }>("model-pull-progress", (payload) => {
    setImportingProgress(payload.model, payload.message);
  });

  useTauriEvent<{ model: string }>("model-pull-complete", (payload) => {
    const isAihub = useDownloadStore
      .getState()
      .downloads.some((d) => d.id === payload.model && d.aihub);
    setStatus(payload.model, "finished");
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

  return { downloads, cancelling, cancel, requeue, remove, clearFinished };
}
