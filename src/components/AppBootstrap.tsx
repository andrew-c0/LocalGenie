import { type ReactNode, useEffect } from "react";
import * as db from "../services/database";
import * as geniex from "../services/geniex";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";

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

  useEffect(() => {
    (async () => {
      // Independent reads run in parallel.
      const [installed, saved, models, port] = await Promise.all([
        geniex.checkGeniexInstalled().catch(() => false),
        db.loadSessions().catch((err) => {
          console.error("[init] Failed to load sessions:", err);
          return null;
        }),
        geniex.listModels().catch(() => null), // CLI may not be installed
        db.getPreference<number>("server_port").catch(() => null),
      ]);

      setCliInstalled(installed);
      if (saved) loadSessions(saved);
      if (models) setModels(models);
      if (port && port > 0) setServerPort(port);

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
  }, [loadSessions, setModels, setUpdateInfo, setServerStatus, setCliInstalled, setServerPort]);

  return <>{children}</>;
}
