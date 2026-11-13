import { useMcpStatusEvents } from "./useMcpStatusEvents";

/**
 * MCP side effects with no UI: the status events of the servers. Mounted by the main layout, so a
 * server that connects in the background keeps the tool list right on any page.
 */
export function McpRuntime() {
  useMcpStatusEvents();
  return null;
}
