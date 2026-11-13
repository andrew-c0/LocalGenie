import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
}));

const listenEvent = vi.fn();
vi.mock("./events", () => ({
  listenEvent: (event: string, handler: unknown) => listenEvent(event, handler),
}));

import type { McpServerConfig, McpServerInfo } from "../types";
import {
  listenMcpServerStatus,
  listMcpServers,
  MCP_STATUS_EVENT,
  removeMcpServer,
  saveMcpServer,
  startMcpServer,
  stopMcpServer,
} from "./mcp";

const config: McpServerConfig = {
  id: "",
  name: "Files",
  transport: "stdio",
  command: "npx",
  args: ["-y", "server"],
  env: {},
  headers: {},
  enabled: true,
};

const info: McpServerInfo = { config: { ...config, id: "a" }, status: "stopped", toolCount: 0 };

describe("MCP service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists the servers with the mcp_server_list command", async () => {
    invoke.mockResolvedValue([info]);
    await expect(listMcpServers()).resolves.toEqual([info]);
    expect(invoke).toHaveBeenCalledWith("mcp_server_list", undefined);
  });

  it("saves the config under the config argument and returns the server", async () => {
    invoke.mockResolvedValue(info);
    await expect(saveMcpServer(config)).resolves.toEqual(info);
    expect(invoke).toHaveBeenCalledWith("mcp_server_save", { config });
  });

  it("removes a server by id", async () => {
    invoke.mockResolvedValue(undefined);
    await removeMcpServer("a");
    expect(invoke).toHaveBeenCalledWith("mcp_server_remove", { id: "a" });
  });

  it("starts and stops a server by id and returns its status", async () => {
    invoke.mockResolvedValue(info);
    await expect(startMcpServer("a")).resolves.toEqual(info);
    expect(invoke).toHaveBeenLastCalledWith("mcp_server_start", { id: "a" });
    await expect(stopMcpServer("a")).resolves.toEqual(info);
    expect(invoke).toHaveBeenLastCalledWith("mcp_server_stop", { id: "a" });
  });

  it("rejects with the backend's message when a command fails", async () => {
    invoke.mockRejectedValue("command is required");
    await expect(saveMcpServer(config)).rejects.toBe("command is required");
  });

  it("listens to the mcp-server-status event and passes each status to the handler", async () => {
    const stop = vi.fn();
    listenEvent.mockResolvedValue(stop);
    const handler = vi.fn();

    const unlisten = await listenMcpServerStatus(handler);

    expect(listenEvent).toHaveBeenCalledWith(MCP_STATUS_EVENT, handler);
    expect(MCP_STATUS_EVENT).toBe("mcp-server-status");
    expect(unlisten).toBe(stop);
  });
});
