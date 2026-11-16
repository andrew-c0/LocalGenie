import { messagesOf } from "../../stores/chatStore";
import { useDispatchStore } from "../../stores/dispatchStore";
import { useToolStore } from "../../stores/toolStore";
import type { ChatToolCall, ToolDefinition } from "../../types";
import {
  conversationMayUse,
  cutNotes,
  dispatchStateOf,
  effectiveDispatchStates,
  isDispatchTool,
  NOTES_SAVED_TEXT,
  NOTES_TOOL,
  parseNotesCall,
} from "../../utils/dispatchTools";
import { errorMessage } from "../../utils/errorMessage";
import type { ToolState } from "../../utils/toolAccess";
import {
  cancelledOutcome,
  failedOutcome,
  NO_CALL_LIMIT,
  offeredTools,
  pendingToolCalls,
  splitCalls,
  type ToolOutcome,
} from "../../utils/toolLoop";
import { addToolRow, outcomeForCall, runRules } from "../toolLoop";
import { askWhileNeedsYou } from "./approval";
import type { Turn } from "./state";

/**
 * The tools a request offers: the registry tools whose Dispatch state is On or Request approval and that are
 * switched on for this conversation, plus the notes tool. An Off tool is not offered. The Dispatch states are read
 * at each request. A tool with no Dispatch state of its own is On.
 */
export function conversationTools(sessionId: string): ToolDefinition[] {
  const store = useToolStore.getState();
  const states = dispatchStates();
  const mayUse = store.tools.filter((spec) =>
    conversationMayUse(states[spec.name] ?? "off", store.isToolEnabledInChat(sessionId, spec.name)),
  );
  const registry = offeredTools(
    mayUse,
    states,
    store.enabledSearchSources,
    store.searchSources,
    store.allowedFolders,
  );
  return [...registry, NOTES_TOOL];
}

/**
 * Runs a reply's calls in order, every one of them: an unattended conversation has no per-reply cap. A stop
 * ends the calls with a cancelled result, so each call still has a row.
 */
export async function runCalls(turn: Turn, calls: ChatToolCall[]): Promise<void> {
  const { run } = splitCalls(calls, NO_CALL_LIMIT);
  for (const call of run) {
    if (turn.stopRequested) {
      answerPendingCalls(turn.sessionId, cancelledOutcome());
      return;
    }
    addToolRow(turn.sessionId, call, await resultOf(turn, call));
  }
}

/** Gives every call of the last reply that has no result the outcome. */
export function answerPendingCalls(sessionId: string, outcome: ToolOutcome): void {
  for (const call of pendingToolCalls(messagesOf(sessionId))) {
    addToolRow(sessionId, call, outcome);
  }
}

function resultOf(turn: Turn, call: ChatToolCall): Promise<ToolOutcome> {
  return isDispatchTool(call.name) ? notesOutcome(turn, call) : registryOutcome(turn, call);
}

/** The Dispatch state of a tool now: the one the user set, else On. */
function dispatchStateNow(name: string): ToolState {
  return dispatchStateOf(name, useToolStore.getState().dispatchStates);
}

/** The Dispatch state of every tool, with the default On for a tool the user has not set. */
function dispatchStates(): Record<string, ToolState> {
  const store = useToolStore.getState();
  return effectiveDispatchStates(
    store.tools.map((spec) => spec.name),
    store.dispatchStates,
  );
}

/**
 * A registry tool call, decided by the same rule as a chat call, with the Dispatch states. The tool is switched on
 * for this conversation; a Request approval tool asks, and the conversation waits as needs_you while the question
 * is open.
 */
function registryOutcome(turn: Turn, call: ChatToolCall): Promise<ToolOutcome> {
  const rules = runRules(turn.sessionId, dispatchStateNow, (item) => askWhileNeedsYou(turn, item));
  return outcomeForCall(rules, call, turn.modelId);
}

/** The notes tool: replaces the conversation's notes with the text. Bad arguments are a failed result. */
async function notesOutcome(turn: Turn, call: ChatToolCall): Promise<ToolOutcome> {
  const parsed = parseNotesCall(call);
  if (!parsed.ok) return failedOutcome(parsed.error, "auto");
  try {
    await useDispatchStore.getState().update(turn.taskId, { notes: cutNotes(parsed.text) });
    return { status: "ok", content: NOTES_SAVED_TEXT, approval: "auto" };
  } catch (err) {
    return failedOutcome(errorMessage(err), "auto");
  }
}
