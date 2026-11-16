import type { SearchSourceInfo, ToolSpec } from "../types";
import { chatToolStateText } from "./chatTools";
import { dispatchToolNote } from "./dispatchTools";
import type { ToolState } from "./toolAccess";
import { isOfferable } from "./webSearchSources";

/** One tool as the tools popover shows it: its state, whether it is used here, and why it cannot be. */
export interface ToolEntry {
  tool: ToolSpec;
  /** The state as small text: "On", "Asks first", "Off" or "No search source on". */
  stateText: string;
  /** The tool can be used here now. Its switch is enabled then. */
  available: boolean;
  /** The switch is on: the tool is used here. */
  checked: boolean;
  /** Why the tool cannot be used here, shown under its switch. Null when it can, or needs no reason. */
  reason: string | null;
}

export interface ToolEntrySettings {
  /**
   * A Dispatch conversation: a tool it lists is used when its Dispatch state is On or Request approval (an Off
   * tool is disabled), and `states` must then be the Dispatch states. A chat uses the chat states.
   */
  isDispatch: boolean;
  /** The state of each tool for this kind of conversation: the chat states, or the Dispatch states in Dispatch. */
  states: Record<string, ToolState>;
  enabledSearchSources: string[];
  searchSources: SearchSourceInfo[];
  /** The tools switched off here (for the chat or the conversation). */
  disabled: readonly string[];
}

/** The popover's entries for the listed tools, in the order given. */
export function toolEntriesOf(tools: ToolSpec[], settings: ToolEntrySettings): ToolEntry[] {
  return tools.map((tool) => entryOf(tool, settings));
}

function entryOf(tool: ToolSpec, settings: ToolEntrySettings): ToolEntry {
  const state = settings.states[tool.name] ?? "off";
  const offerable = isOfferable(tool, settings.enabledSearchSources, settings.searchSources);
  const usable = !settings.isDispatch || state !== "off";
  const available = offerable && usable;
  return {
    tool,
    stateText: chatToolStateText(state, offerable),
    available,
    checked: available && !settings.disabled.includes(tool.name),
    reason: settings.isDispatch ? dispatchToolNote(state) : null,
  };
}

/** How many entries are used here: their switch is on. */
export function checkedCount(entries: readonly ToolEntry[]): number {
  return entries.filter((entry) => entry.checked).length;
}
