import { type ReactNode, useEffect } from "react";
import * as db from "../services/database";
import * as geniex from "../services/geniex";
import { backfillModelRam } from "../services/modelRam";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import { useRamEstimateStore } from "../stores/ramEstimateStore";

/**
 * Startup only: loads the CLI state, saved sessions, installed models, server status and the
 * CLI update check once. Everything that runs afterwards is owned by the component that uses it
 * (model loading in the header, downloads in the drawer, streaming in `ChatRuntime`).
 */
export default function AppBootstrap({ children }: { children: ReactNode }) {
  const loadSessions = useChatStore((s) => s.loadSessions);
  const setModels = useModelStore((s) => s.setModels);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setServerPort = useModelStore((s) => s.setServerPort);
  const setCliInstalled = useModelStore((s) => s.setCliInstalled);
  const setUpdateInfo = useModelStore((s) => s.setUpdateInfo);
  const setChipset = useModelStore((s) => s.setChipset);
  const models = useModelStore((s) => s.models);

  // The stored RAM figures are read when the local model list changes (startup, a finished download, a
  // removal), so the model selector only shows them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the model list is the trigger, the figures are read from the database
  useEffect(() => {
    void useRamEstimateStore.getState().refresh();
  }, [models]);

  useEffect(() => {
    (async () => {
      // Independent reads run in parallel.
      const [installed, saved, models, port, chipset] = await Promise.all([
        geniex.checkGeniexInstalled().catch(() => false),
        db.loadSessions().catch((err) => {
          console.error("[init] Failed to load sessions:", err);
          return null;
        }),
        geniex.listModels().catch(() => null), // CLI may not be installed
        db.getPreference<number>("server_port").catch(() => null),
        // Chipset comes from the CLI host probe. It is null when the CLI is missing.
        geniex.configGet("chipset").catch(() => null),
      ]);

      setCliInstalled(installed);
      if (saved) loadSessions(saved);
      if (models) setModels(models);
      // Models downloaded before the RAM figures were kept get them now, then the selector shows them.
      backfillModelRam()
        .then(() => useRamEstimateStore.getState().refresh())
        .catch((err: unknown) => console.warn("[init] RAM backfill failed:", err));
      if (port && port > 0) setServerPort(port);
      setChipset(chipset);

      const status = await geniex
        .getServerStatus(useModelStore.getState().serverPort)
        .catch(() => null);
      if (status) setServerStatus(status);

      // The update check calls GitHub and can be slow: don't hold up the rest of startup.
      if (installed) {
        geniex
          .checkForCliUpdate()
          .then(setUpdateInfo)
          .catch(() => undefined);
      }
    })();
  }, [
    loadSessions,
    setModels,
    setUpdateInfo,
    setServerStatus,
    setCliInstalled,
    setServerPort,
    setChipset,
  ]);

  return <>{children}</>;
}
