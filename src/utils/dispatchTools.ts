import type { ChatToolCall, ToolDefinition, ToolSpec } from "../types";
import type { ToolState } from "./toolAccess";
import { parseJsonObject } from "./toolRecords";

export const DISPATCH_NOTES = "dispatch_notes";

/** The notes a conversation keeps, in characters. A longer text is cut. */
export const NOTES_MAX_CHARS = 1500;

/** The one tool a Dispatch turn adds to the registry tools. It is not in the registry. */
export const NOTES_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: DISPATCH_NOTES,
    description:
      "Replace your notes for this conversation with this text: the plan and what is done so far. Keep it short; you see it at every turn.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "The whole notes text." } },
      required: ["text"],
    },
  },
};

/** True for the Dispatch tool, which is not in the tool registry. */
export function isDispatchTool(name: string): boolean {
  return name === DISPATCH_NOTES;
}

export type NotesParse = { ok: true; text: string } | { ok: false; error: string };

/**
 * The text of a `dispatch_notes` call. Missing or wrong arguments are a failed result that names what was
 * expected, so the model can call again.
 */
export function parseNotesCall(call: Pick<ChatToolCall, "arguments">): NotesParse {
  const args = parseJsonObject(call.arguments);
  if (typeof args?.text === "string") return { ok: true, text: args.text };
  return { ok: false, error: `Invalid arguments for ${DISPATCH_NOTES}: expected a "text" text.` };
}

/** The notes text as stored: the first NOTES_MAX_CHARS characters. */
export function cutNotes(text: string): string {
  return Array.from(text).slice(0, NOTES_MAX_CHARS).join("");
}

/** The result text of a `dispatch_notes` call that succeeded. */
export const NOTES_SAVED_TEXT = "Notes saved.";

/** The note under an Off tool's switch in a Dispatch conversation. */
export const DISPATCH_OFF_REASON = "Off in the Dispatch settings. Change it in Settings > Tools";

/** The note under a Request approval tool's switch in a Dispatch conversation. */
export const ASKS_BEFORE_USE_NOTE = "Asks before each use";

/**
 * The note a Dispatch conversation shows under a tool's switch, by the tool's Dispatch state: Off says how
 * to turn it on, Request approval says it asks, On has no note.
 */
export function dispatchToolNote(state: ToolState): string | null {
  if (state === "off") return DISPATCH_OFF_REASON;
  if (state === "ask") return ASKS_BEFORE_USE_NOTE;
  return null;
}

/** The Dispatch state of a tool the user has not set in Settings > Tools. Dispatch tools are On by default. */
export const DISPATCH_DEFAULT_STATE: ToolState = "on";

/**
 * The state a tool has in Dispatch: the Dispatch state the user set in Settings > Tools, else On. A tool added
 * later, and an MCP tool, is On until the user sets it.
 */
export function dispatchStateOf(
  name: string,
  dispatchStates: Record<string, ToolState>,
): ToolState {
  return dispatchStates[name] ?? DISPATCH_DEFAULT_STATE;
}

/** The Dispatch state of every listed tool, with the default applied. Used where a whole map is read. */
export function effectiveDispatchStates(
  names: readonly string[],
  dispatchStates: Record<string, ToolState>,
): Record<string, ToolState> {
  return Object.fromEntries(names.map((name) => [name, dispatchStateOf(name, dispatchStates)]));
}

/** Shown when a read tool and a network tool can both run: a page could make the conversation send what it read. */
export const RISK_WARNING =
  "This conversation can read files and reach the internet. A page it opens could try to make it send what it read. Switch one off if you do not need both.";

/**
 * True when a registry tool is offered to a conversation: its Dispatch state is On or Request approval, and the
 * conversation has it switched on. An Off tool is never offered. `state` is the tool's Dispatch state.
 */
export function conversationMayUse(state: ToolState, switchedOnHere: boolean): boolean {
  return state !== "off" && switchedOnHere;
}

/**
 * The names a conversation is recorded with at creation: the tools whose Dispatch state is On or Request
 * approval, not switched off in the draft. `states` is the Dispatch state of each tool.
 */
export function allowedToolNames(
  tools: readonly ToolSpec[],
  states: Record<string, ToolState>,
  switchedOff: readonly string[],
): string[] {
  return tools
    .filter((tool) => (states[tool.name] ?? "off") !== "off" && !switchedOff.includes(tool.name))
    .map((tool) => tool.name);
}

/** True when the names include a read tool and a network tool. The conversation then shows the warning. */
export function riskWarning(tools: readonly ToolSpec[], offered: readonly string[]): boolean {
  const risks = new Set(
    tools.filter((tool) => offered.includes(tool.name)).map((tool) => tool.risk),
  );
  return risks.has("read") && risks.has("network");
}

/** The tools popup's title count, for example "Tools for this conversation, 3 active". */
export function conversationToolsLabel(activeCount: number): string {
  return `Tools for this conversation, ${activeCount} active`;
}
