import { create } from "zustand";
import {
  listMcpServers,
  refreshMcpServer,
  removeMcpServer,
  saveMcpServer,
  startMcpServer,
  stopMcpServer,
} from "../services/mcp";
import type { McpServerConfig, McpServerInfo } from "../types";
import { errorMessage } from "../utils/errorMessage";
import { toast } from "../utils/toast";
import { useToolStore } from "./toolStore";

interface McpStoreState {
  /** The saved MCP servers by id, each with its live status. Empty until loaded. */
  servers: Record<string, McpServerInfo>;
  /** True once the server list has been read. */
  loaded: boolean;
  /** The first-load failure, kept as the raw error. Null when the last load worked or has not failed. */
  loadError: unknown;
  /** Ids of the servers with a start, stop, refresh, remove or enable change in progress. */
  busyIds: string[];
  /** Reads the server list, then the tool list (a running server adds its tools). Safe to call again to retry. */
  load: () => Promise<void>;
  /** Saves a server (new when its id is empty) and returns it. Rejects with the error, so the form can show it. */
  save: (config: McpServerConfig) => Promise<McpServerInfo>;
  /** Deletes a server and its tools. A failure shows a toast and keeps the server. */
  remove: (id: string) => Promise<void>;
  /** Starts a server. A failure shows a toast and the server keeps its last status. */
  start: (id: string) => Promise<void>;
  /** Stops a server. A failure shows a toast. */
  stop: (id: string) => Promise<void>;
  /** Lists a running server's tools again. A failure shows a toast and the server keeps its last status. */
  refresh: (id: string) => Promise<void>;
  /** Turns connect-at-start on or off for a server and saves it. A failure shows a toast. */
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  /** Keeps a status the backend sent (the status event, or a command's result) and refreshes the tool list. */
  applyStatus: (info: McpServerInfo) => void;
}

/** Saved MCP servers by id, with their live status. The tool list follows every status change. */
export const useMcpStore = create<McpStoreState>((set, get) => {
  const markBusy = (id: string, busy: boolean) => {
    set((current) => ({
      busyIds: busy ? [...current.busyIds, id] : current.busyIds.filter((busyId) => busyId !== id),
    }));
  };

  const applyStatus = (info: McpServerInfo) => {
    set((current) => ({ servers: { ...current.servers, [info.config.id]: info } }));
    void useToolStore.getState().refreshTools();
  };

  /** Runs a start or stop. The result is kept; a failure is shown and the server keeps its last status. */
  const runServerCommand = async (
    id: string,
    failure: string,
    command: () => Promise<McpServerInfo>,
  ) => {
    markBusy(id, true);
    try {
      applyStatus(await command());
    } catch (err) {
      toast.error(failure, errorMessage(err));
    } finally {
      markBusy(id, false);
    }
  };

  return {
    servers: {},
    loaded: false,
    loadError: null,
    busyIds: [],

    load: async () => {
      set({ loadError: null });
      try {
        const list = await listMcpServers();
        const servers = Object.fromEntries(list.map((info) => [info.config.id, info]));
        set({ servers, loaded: true, loadError: null });
        void useToolStore.getState().refreshTools();
      } catch (err) {
        console.warn("[mcp] MCP servers unavailable:", err);
        set({ loaded: false, loadError: err });
      }
    },

    save: async (config) => {
      const info = await saveMcpServer(config);
      applyStatus(info);
      return info;
    },

    remove: async (id) => {
      markBusy(id, true);
      try {
        await removeMcpServer(id);
        set((current) => {
          const { [id]: _removed, ...rest } = current.servers;
          return { servers: rest };
        });
        void useToolStore.getState().refreshTools();
      } catch (err) {
        toast.error("Could not remove the MCP server", errorMessage(err));
      } finally {
        markBusy(id, false);
      }
    },

    start: (id) => runServerCommand(id, "Could not start the MCP server", () => startMcpServer(id)),

    stop: (id) => runServerCommand(id, "Could not stop the MCP server", () => stopMcpServer(id)),

    refresh: (id) =>
      runServerCommand(id, "Could not refresh the MCP server's tools", () => refreshMcpServer(id)),

    setEnabled: async (id, enabled) => {
      const current = get().servers[id];
      if (!current) return;
      markBusy(id, true);
      try {
        applyStatus(await saveMcpServer({ ...current.config, enabled }));
      } catch (err) {
        toast.error("Could not save the MCP server", errorMessage(err));
      } finally {
        markBusy(id, false);
      }
    },

    applyStatus,
  };
});
