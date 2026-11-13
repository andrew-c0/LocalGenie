import { type ReactNode, useEffect } from "react";
import * as db from "../services/database";
import * as geniex from "../services/geniex";
import { backfillModelRam } from "../services/modelRam";
import { useAppUpdateStore } from "../stores/appUpdateStore";
import { useChatStore } from "../stores/chatStore";
import { useMcpStore } from "../stores/mcpStore";
import { useModelStore } from "../stores/modelStore";
import { useRamEstimateStore } from "../stores/ramEstimateStore";
import { useRuntimeNoticeStore } from "../stores/runtimeNoticeStore";
import { useRuntimeStore } from "../stores/runtimeStore";
import { useSidebarStore } from "../stores/sidebarStore";
import { useToolStore } from "../stores/toolStore";

/**
 * Startup only: loads the runtime list (which also sets the CLI state), saved sessions, installed
 * models, server status, the sidebar's saved state, the runtime update checks, the saved runtime notice state and the
 * saved app update notified version, the tool settings (states, allowed folders) and the MCP server list once. Everything that runs afterwards is owned by
 * the component that uses it (model loading in the header, downloads in the drawer, streaming in `ChatRuntime`, MCP status events in `McpRuntime`).
 */
export default function AppBootstrap({ children }: { children: ReactNode }) {
  const loadSessions = useChatStore((s) => s.loadSessions);
  const setModels = useModelStore((s) => s.setModels);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setServerPort = useModelStore((s) => s.setServerPort);
  const setChipset = useModelStore((s) => s.setChipset);
  const models = useModelStore((s) => s.models);

  // The stored RAM figures are read when the local model list changes (startup, a finished download, a
  // removal), so the model selector only shows them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the model list is the trigger, the figures are read from the database
  useEffect(() => {
    void useRamEstimateStore.getState().refresh();
  }, [models]);

  useEffect(() => {
    // The sidebar's saved collapsed state, so it opens as the user left it.
    void useSidebarStore.getState().loadCollapsed();
    void useRuntimeNoticeStore.getState().load();
    void useAppUpdateStore.getState().loadNotifiedVersion();
    void useToolStore.getState().load();
    void useMcpStore.getState().load();

    (async () => {
      // The release checks call GitHub and can be slow, so they start once the list is read and do not
      // hold up the rest of startup. They run without the CLI too, so Settings > Runtimes can show the
      // latest version before an install.
      void useRuntimeStore
        .getState()
        .refresh()
        .then(() => useRuntimeStore.getState().checkUpdates());

      // Independent reads run in parallel.
      const [saved, models, port, chipset] = await Promise.all([
        db.loadSessions().catch((err) => {
          console.error("[init] Failed to load sessions:", err);
          return null;
        }),
        geniex.listModels().catch(() => null), // CLI may not be installed
        db.getPreference<number>("server_port").catch(() => null),
        // Chipset comes from the CLI host probe. It is null when the CLI is missing.
        geniex.configGet("chipset").catch(() => null),
      ]);

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
    })();
  }, [loadSessions, setModels, setServerStatus, setServerPort, setChipset]);

  return <>{children}</>;
}
