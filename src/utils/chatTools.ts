/**
 * Pure rules for the per-chat tools chip: which tools the chip lists and how many are active in a chat.
 * No state and no I/O here; the composer's chip reads them from the tool store.
 */

import type { SearchSourceInfo, ToolSpec } from "../types";
import { groupToolsBySource } from "./mcpTools";
import type { ToolState } from "./toolAccess";
import { isOfferable } from "./webSearchSources";

/** The global state as the chip's popover shows it. A tool that is off is not listed, so only two appear. */
const CHAT_TOOL_STATE_TEXT: Record<ToolState, string> = {
  off: "Off",
  ask: "Asks first",
  on: "On",
};

/** The popover text for a tool the model cannot be offered now, because no search source is on. */
const NO_SOURCE_STATE_TEXT = "No search source on";

/**
 * The state of a tool as the popover shows it, as small text. A tool that cannot be offered now (see
 * `isOfferable`) reads "No search source on" whatever its global state is.
 */
export function chatToolStateText(state: ToolState, offerable: boolean): string {
  return offerable ? CHAT_TOOL_STATE_TEXT[state] : NO_SOURCE_STATE_TEXT;
}

/** The tools whose global state is not off, in registry order. These are the tools the chip lists. */
export function chatToolRows(tools: ToolSpec[], states: Record<string, ToolState>): ToolSpec[] {
  return tools.filter((tool) => (states[tool.name] ?? "off") !== "off");
}

/** One part of the chip's list: the built-in tools (no title) or the tools of one MCP server. */
export interface ChatToolGroup {
  key: string;
  /** The server's name, or null for the built-in tools. */
  title: string | null;
  tools: ToolSpec[];
}

/**
 * The chip's rows in groups: the built-in tools first, then one group per MCP server, sorted by name.
 * Each group keeps the registry order of its tools. The counts do not depend on the grouping.
 */
export function chatToolGroups(rows: ToolSpec[]): ChatToolGroup[] {
  const { native, servers } = groupToolsBySource(rows);
  const groups: ChatToolGroup[] = [];
  if (native.length > 0) groups.push({ key: "native", title: null, tools: native });
  for (const server of servers) {
    groups.push({ key: server.serverId, title: server.serverName, tools: server.tools });
  }
  return groups;
}

/**
 * How many of the listed tools the model is offered in this chat: not switched off for it, and offerable
 * now. A tool with no search source on is not counted, because the model is not offered it.
 */
export function activeChatToolCount(
  rows: ToolSpec[],
  disabledInChat: string[],
  enabledSourceIds: string[],
  searchSources: SearchSourceInfo[],
): number {
  return rows.filter(
    (tool) =>
      !disabledInChat.includes(tool.name) && isOfferable(tool, enabledSourceIds, searchSources),
  ).length;
}

/** The chip's accessible name, for example "Tools for this chat, 3 active". */
export function chatToolsLabel(activeCount: number): string {
  return `Tools for this chat, ${activeCount} active`;
}
