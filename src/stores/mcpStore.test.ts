import { beforeEach, describe, expect, it, vi } from "vitest";

const listMcpServers = vi.fn();
const saveMcpServer = vi.fn();
const removeMcpServer = vi.fn();
const startMcpServer = vi.fn();
const stopMcpServer = vi.fn();
const refreshMcpServer = vi.fn();
vi.mock("../services/mcp", () => ({
  listMcpServers: () => listMcpServers(),
  saveMcpServer: (config: unknown) => saveMcpServer(config),
  removeMcpServer: (id: string) => removeMcpServer(id),
  startMcpServer: (id: string) => startMcpServer(id),
  stopMcpServer: (id: string) => stopMcpServer(id),
  refreshMcpServer: (id: string) => refreshMcpServer(id),
}));

const refreshTools = vi.fn();
vi.mock("./toolStore", () => ({
  useToolStore: { getState: () => ({ refreshTools: () => refreshTools() }) },
}));

const toastError = vi.fn();
vi.mock("../utils/toast", () => ({
  toast: { error: (title: string, body?: string) => toastError(title, body) },
}));

import type { McpServerConfig, McpServerInfo } from "../types";
import { useMcpStore } from "./mcpStore";

function config(id: string, overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id,
    name: `Server ${id}`,
    transport: "stdio",
    command: "npx",
    args: [],
    env: {},
    headers: {},
    enabled: true,
    ...overrides,
  };
}

function info(id: string, overrides: Partial<McpServerInfo> = {}): McpServerInfo {
  return { config: config(id), status: "stopped", toolCount: 0, ...overrides };
}

const initialState = {
  servers: {},
  loaded: false,
  loadError: null,
  busyIds: [],
};

/** A promise the test settles by hand, to look at the store while a command is running. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("mcpStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    refreshTools.mockResolvedValue(undefined);
    useMcpStore.setState(initialState);
  });

  describe("load", () => {
    it("keeps the servers by id and marks the list loaded, then refreshes the tools", async () => {
      listMcpServers.mockResolvedValue([info("a"), info("b", { status: "running", toolCount: 2 })]);

      await useMcpStore.getState().load();

      const state = useMcpStore.getState();
      expect(Object.keys(state.servers)).toEqual(["a", "b"]);
      expect(state.servers.b.toolCount).toBe(2);
      expect(state.loaded).toBe(true);
      expect(state.loadError).toBeNull();
      expect(refreshTools).toHaveBeenCalled();
    });

    it("keeps the raw error and stays unloaded when the list fails", async () => {
      const failure = new Error("database locked");
      listMcpServers.mockRejectedValue(failure);

      await useMcpStore.getState().load();

      expect(useMcpStore.getState().loaded).toBe(false);
      expect(useMcpStore.getState().loadError).toBe(failure);
      expect(refreshTools).not.toHaveBeenCalled();
    });

    it("clears the error when a retry starts and then succeeds", async () => {
      listMcpServers.mockRejectedValueOnce(new Error("offline"));
      await useMcpStore.getState().load();
      expect(useMcpStore.getState().loadError).not.toBeNull();

      listMcpServers.mockResolvedValueOnce([info("a")]);
      const retry = useMcpStore.getState().load();
      expect(useMcpStore.getState().loadError).toBeNull();
      await retry;

      expect(useMcpStore.getState().loaded).toBe(true);
      expect(useMcpStore.getState().servers.a).toBeDefined();
    });
  });

  describe("applyStatus", () => {
    it("replaces the server's status and refreshes the tool list", () => {
      useMcpStore.setState({ servers: { a: info("a") } });

      useMcpStore.getState().applyStatus(info("a", { status: "failed", error: "no such program" }));

      expect(useMcpStore.getState().servers.a.status).toBe("failed");
      expect(useMcpStore.getState().servers.a.error).toBe("no such program");
      expect(refreshTools).toHaveBeenCalledTimes(1);
    });

    it("adds a server the list did not have yet", () => {
      useMcpStore.getState().applyStatus(info("new", { status: "starting" }));
      expect(useMcpStore.getState().servers.new.status).toBe("starting");
    });
  });

  describe("start and stop", () => {
    it("shows the status the backend returns and refreshes the tools", async () => {
      useMcpStore.setState({ servers: { a: info("a") } });
      startMcpServer.mockResolvedValue(info("a", { status: "running", toolCount: 3 }));

      await useMcpStore.getState().start("a");

      expect(startMcpServer).toHaveBeenCalledWith("a");
      expect(useMcpStore.getState().servers.a).toMatchObject({ status: "running", toolCount: 3 });
      expect(useMcpStore.getState().busyIds).toEqual([]);
      expect(refreshTools).toHaveBeenCalled();
    });

    it("marks the server busy while the command runs", async () => {
      useMcpStore.setState({ servers: { a: info("a") } });
      const pending = deferred<McpServerInfo>();
      stopMcpServer.mockReturnValue(pending.promise);

      const running = useMcpStore.getState().stop("a");
      expect(useMcpStore.getState().busyIds).toEqual(["a"]);

      pending.resolve(info("a"));
      await running;
      expect(useMcpStore.getState().busyIds).toEqual([]);
    });

    it("shows a toast and keeps the old status when a start fails", async () => {
      useMcpStore.setState({ servers: { a: info("a") } });
      startMcpServer.mockRejectedValue("command not found");

      await useMcpStore.getState().start("a");

      expect(toastError).toHaveBeenCalledWith(
        "Could not start the MCP server",
        "command not found",
      );
      expect(useMcpStore.getState().servers.a.status).toBe("stopped");
      expect(useMcpStore.getState().busyIds).toEqual([]);
    });

    it("stops a server and shows the status returned", async () => {
      useMcpStore.setState({ servers: { a: info("a", { status: "running", toolCount: 2 }) } });
      stopMcpServer.mockResolvedValue(info("a", { status: "stopped" }));

      await useMcpStore.getState().stop("a");

      expect(stopMcpServer).toHaveBeenCalledWith("a");
      expect(useMcpStore.getState().servers.a.status).toBe("stopped");
    });

    it("shows a toast when a stop fails", async () => {
      useMcpStore.setState({ servers: { a: info("a", { status: "running" }) } });
      stopMcpServer.mockRejectedValue(new Error("process is gone"));

      await useMcpStore.getState().stop("a");

      expect(toastError).toHaveBeenCalledWith("Could not stop the MCP server", "process is gone");
      expect(useMcpStore.getState().servers.a.status).toBe("running");
    });
  });

  describe("refresh", () => {
    it("shows the server's new tool count and refreshes the tool list", async () => {
      useMcpStore.setState({ servers: { a: info("a", { status: "running", toolCount: 1 }) } });
      refreshMcpServer.mockResolvedValue(info("a", { status: "running", toolCount: 4 }));

      await useMcpStore.getState().refresh("a");

      expect(refreshMcpServer).toHaveBeenCalledWith("a");
      expect(useMcpStore.getState().servers.a).toMatchObject({ status: "running", toolCount: 4 });
      expect(useMcpStore.getState().busyIds).toEqual([]);
      expect(refreshTools).toHaveBeenCalled();
    });

    it("marks the server busy while the refresh runs", async () => {
      useMcpStore.setState({ servers: { a: info("a", { status: "running" }) } });
      const pending = deferred<McpServerInfo>();
      refreshMcpServer.mockReturnValue(pending.promise);

      const running = useMcpStore.getState().refresh("a");
      expect(useMcpStore.getState().busyIds).toEqual(["a"]);

      pending.resolve(info("a", { status: "running" }));
      await running;
      expect(useMcpStore.getState().busyIds).toEqual([]);
    });

    it("shows a toast and keeps the last status when the refresh fails", async () => {
      useMcpStore.setState({ servers: { a: info("a", { status: "running", toolCount: 2 }) } });
      refreshMcpServer.mockRejectedValue("The server stopped answering");

      await useMcpStore.getState().refresh("a");

      expect(toastError).toHaveBeenCalledWith(
        "Could not refresh the MCP server's tools",
        "The server stopped answering",
      );
      expect(useMcpStore.getState().servers.a).toMatchObject({ status: "running", toolCount: 2 });
      expect(useMcpStore.getState().busyIds).toEqual([]);
    });
  });

  describe("remove", () => {
    it("removes the server and its tools", async () => {
      useMcpStore.setState({ servers: { a: info("a"), b: info("b") } });
      removeMcpServer.mockResolvedValue(undefined);

      await useMcpStore.getState().remove("a");

      expect(removeMcpServer).toHaveBeenCalledWith("a");
      expect(Object.keys(useMcpStore.getState().servers)).toEqual(["b"]);
      expect(refreshTools).toHaveBeenCalled();
    });

    it("keeps the server and shows a toast when the removal fails", async () => {
      useMcpStore.setState({ servers: { a: info("a") } });
      removeMcpServer.mockRejectedValue("database is busy");

      await useMcpStore.getState().remove("a");

      expect(useMcpStore.getState().servers.a).toBeDefined();
      expect(toastError).toHaveBeenCalledWith(
        "Could not remove the MCP server",
        "database is busy",
      );
    });
  });

  describe("save", () => {
    it("stores the saved server and returns it", async () => {
      const saved = info("new-id");
      saveMcpServer.mockResolvedValue(saved);

      await expect(useMcpStore.getState().save(config(""))).resolves.toEqual(saved);

      expect(saveMcpServer).toHaveBeenCalledWith(config(""));
      expect(useMcpStore.getState().servers["new-id"]).toEqual(saved);
      expect(refreshTools).toHaveBeenCalled();
    });

    it("rejects with the error and changes nothing, so the form can show it", async () => {
      saveMcpServer.mockRejectedValue("URL must start with http");

      await expect(useMcpStore.getState().save(config(""))).rejects.toBe(
        "URL must start with http",
      );

      expect(useMcpStore.getState().servers).toEqual({});
      expect(toastError).not.toHaveBeenCalled();
    });
  });

  describe("setEnabled", () => {
    it("saves the server with the new connect-at-start value", async () => {
      useMcpStore.setState({ servers: { a: info("a") } });
      saveMcpServer.mockResolvedValue(info("a", { config: config("a", { enabled: false }) }));

      await useMcpStore.getState().setEnabled("a", false);

      expect(saveMcpServer).toHaveBeenCalledWith(config("a", { enabled: false }));
      expect(useMcpStore.getState().servers.a.config.enabled).toBe(false);
    });

    it("does nothing for a server the store does not have", async () => {
      await useMcpStore.getState().setEnabled("missing", true);
      expect(saveMcpServer).not.toHaveBeenCalled();
    });

    it("shows a toast and keeps the old value when the save fails", async () => {
      useMcpStore.setState({ servers: { a: info("a") } });
      saveMcpServer.mockRejectedValue("disk full");

      await useMcpStore.getState().setEnabled("a", false);

      expect(toastError).toHaveBeenCalledWith("Could not save the MCP server", "disk full");
      expect(useMcpStore.getState().servers.a.config.enabled).toBe(true);
      expect(useMcpStore.getState().busyIds).toEqual([]);
    });
  });
});
