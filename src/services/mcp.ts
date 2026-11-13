import { invoke } from "@tauri-apps/api/core";
import type { McpServerConfig, McpServerInfo } from "../types";
import { listenEvent } from "./events";

/** The event the backend sends with the new status of an MCP server, on every change. */
export const MCP_STATUS_EVENT = "mcp-server-status";

/** Every saved MCP server with its live status. The only wrapper of the MCP commands. */
export async function listMcpServers(): Promise<McpServerInfo[]> {
  return invoke("mcp_server_list");
}

/** Saves a server (a new one when `config.id` is empty) and returns it with its status. */
export async function saveMcpServer(config: McpServerConfig): Promise<McpServerInfo> {
  return invoke("mcp_server_save", { config });
}

/** Deletes a server, stops it and removes its tools. */
export async function removeMcpServer(id: string): Promise<void> {
  await invoke("mcp_server_remove", { id });
}

/** Starts a server and returns its status after the attempt. */
export async function startMcpServer(id: string): Promise<McpServerInfo> {
  return invoke("mcp_server_start", { id });
}

/** Stops a server and returns its status. */
export async function stopMcpServer(id: string): Promise<McpServerInfo> {
  return invoke("mcp_server_stop", { id });
}

/** Listens for status changes of every MCP server. Resolves to the function that stops listening. */
export function listenMcpServerStatus(handler: (info: McpServerInfo) => void): Promise<() => void> {
  return listenEvent<McpServerInfo>(MCP_STATUS_EVENT, handler);
}
