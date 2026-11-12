/**
 * Pure rules for the per-chat tools chip: which tools the chip lists and how many are active in a chat.
 * No state and no I/O here; the composer's chip reads them from the tool store.
 */

import type { ToolSpec } from "../types";
import type { ToolState } from "./toolAccess";

/** The global state as the chip's popover shows it. A tool that is off is not listed, so only two appear. */
const CHAT_TOOL_STATE_TEXT: Record<ToolState, string> = {
  off: "Off",
  ask: "Asks first",
  on: "On",
};

/** The global state of a tool in the popover, as small text. */
export function chatToolStateText(state: ToolState): string {
  return CHAT_TOOL_STATE_TEXT[state];
}

/** The tools whose global state is not off, in registry order. These are the tools the chip lists. */
export function chatToolRows(tools: ToolSpec[], states: Record<string, ToolState>): ToolSpec[] {
  return tools.filter((tool) => (states[tool.name] ?? "off") !== "off");
}

/** How many of the listed tools are active in this chat: not switched off for it. */
export function activeChatToolCount(rows: ToolSpec[], disabledInChat: string[]): number {
  return rows.filter((tool) => !disabledInChat.includes(tool.name)).length;
}

/** The chip's accessible name, for example "Tools for this chat, 3 active". */
export function chatToolsLabel(activeCount: number): string {
  return `Tools for this chat, ${activeCount} active`;
}
