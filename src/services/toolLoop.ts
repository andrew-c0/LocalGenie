import { messagesOf, useChatStore } from "../stores/chatStore";
import { type ApprovalDecision, useToolApprovalStore } from "../stores/toolApprovalStore";
import { useToolStore } from "../stores/toolStore";
import type { ChatToolCall, ToolApproval, ToolDefinition } from "../types";
import { attachmentGate } from "../utils/attachments";
import { errorMessage } from "../utils/errorMessage";
import { toast } from "../utils/toast";
import { type ToolState, toolAccess } from "../utils/toolAccess";
import {
  buildToolMessage,
  cancelledOutcome,
  deniedOutcome,
  failedOutcome,
  MAX_ROUNDS,
  noSourceOutcome,
  noVisionOutcome,
  offeredTools,
  offOutcome,
  pendingToolCalls,
  resultOutcome,
  skippedOutcome,
  splitCalls,
  type ToolOutcome,
  toolCallsRefused,
  toolImageRef,
  toolsAllowedAfter,
  unknownToolOutcome,
} from "../utils/toolLoop";
import { activeSourceIds, isOfferable } from "../utils/webSearchSources";
import { historyFor, warnUnavailable } from "./chatHistory";
import { type ModelRun, type SendFailure, streamReply } from "./chatRun";
import * as db from "./database";
import type { ChatMessage } from "./geniex";
import { loadModelCapabilities } from "./models";
import { executeTool } from "./tools";

/** Sessions whose tool loop the user stopped. A send clears its session's mark when it starts. */
const stoppedSessions = new Set<string>();

/** Starts a send. Clears the session's stop mark, so a Stop pressed during an earlier send does not end this one. */
export function beginToolRun(sessionId: string): void {
  stoppedSessions.delete(sessionId);
}

/**
 * Stops a chat's tool loop: no further request or tool call runs, and its pending approvals are
 * cancelled. Safe when no loop runs; the mark is cleared when the next send starts.
 */
export function abortToolLoop(sessionId: string): void {
  stoppedSessions.add(sessionId);
  useToolApprovalStore.getState().cancelApprovalsFor(sessionId);
}

function isStopped(sessionId: string): boolean {
  return stoppedSessions.has(sessionId);
}

/**
 * Runs the tool rounds of a send. While the last reply has calls with no result, runs them (at most
 * MAX_CALLS_PER_ROUND per round) and asks the model again with the results, for at most MAX_ROUNDS
 * rounds. The request after the last round offers no tools. Resolves with the failure to show, or null.
 * Streaming state is cleared at the end, however the run ended.
 */
export async function runToolRounds(sessionId: string, run: ModelRun): Promise<SendFailure | null> {
  try {
    return await loopRounds(sessionId, run);
  } finally {
    const chat = useChatStore.getState();
    chat.setStreaming(false);
    chat.setActiveStream(null);
  }
}

async function loopRounds(sessionId: string, run: ModelRun): Promise<SendFailure | null> {
  let rounds = 0;
  let failure: SendFailure | null = null;
  let calls = pendingToolCalls(messagesOf(sessionId));
  while (!isStopped(sessionId) && rounds < MAX_ROUNDS && calls.length > 0) {
    rounds += 1;
    await runRound(sessionId, calls, run.modelId);
    if (isStopped(sessionId)) break;
    failure = await requestAfterRound(sessionId, run, rounds);
    if (failure) break;
    calls = pendingToolCalls(messagesOf(sessionId));
  }
  if (isStopped(sessionId)) cancelUnanswered(sessionId);
  return failure;
}

/** Runs one round's calls in order, then records the skipped ones. A stop ends the round before its next call. */
async function runRound(
  sessionId: string,
  calls: ChatToolCall[],
  modelId: string | null,
): Promise<void> {
  const split = splitCalls(calls);
  for (const call of split.run) {
    if (isStopped(sessionId)) break;
    addToolRow(sessionId, call, await outcomeForCall(sessionId, call, modelId));
  }
  for (const call of split.skipped) addToolRow(sessionId, call, skippedOutcome());
}

/** The outcome of one call: unknown, off, denied, cancelled, or the result of running it. */
async function outcomeForCall(
  sessionId: string,
  call: ChatToolCall,
  modelId: string | null,
): Promise<ToolOutcome> {
  const tools = useToolStore.getState();
  const spec = tools.tools.find((item) => item.name === call.name);
  if (!spec) return unknownToolOutcome(call.name);

  const state: ToolState = tools.states[call.name] ?? "off";
  const granted = tools.hasChatGrant(sessionId, call.name);
  const access = toolAccess(state, granted);
  if (access === "skip" || !tools.isToolEnabledInChat(sessionId, call.name)) return offOutcome();
  if (!isOfferable(spec, tools.enabledSearchSources, tools.searchSources)) {
    return noSourceOutcome();
  }
  if (access === "run") return runCall(call, state === "on" ? "auto" : "chat", modelId);

  const decision = await askApproval(sessionId, call);
  switch (decision) {
    case "deny":
      return deniedOutcome();
    case "cancel":
      return cancelledOutcome();
    case "chat":
      useToolStore.getState().grantForChat(sessionId, call.name);
      return runCall(call, "chat", modelId);
    case "once":
      return runCall(call, "once", modelId);
  }
}

function askApproval(sessionId: string, call: ChatToolCall): Promise<ApprovalDecision> {
  return useToolApprovalStore.getState().requestApproval({
    id: crypto.randomUUID(),
    sessionId,
    toolName: call.name,
    arguments: call.arguments,
  });
}

/**
 * Runs a call with the saved folders. A thrown error becomes an error outcome, so the model still gets a
 * result. A successful image result is kept only when the model may receive images.
 */
async function runCall(
  call: ChatToolCall,
  approval: ToolApproval,
  modelId: string | null,
): Promise<ToolOutcome> {
  try {
    const tools = useToolStore.getState();
    const result = await executeTool(
      call.name,
      call.arguments,
      tools.allowedFolders,
      activeSourceIds(tools.enabledSearchSources, tools.searchSources),
    );
    const { attachment } = result;
    if (!result.ok || attachment === undefined) return resultOutcome(result, approval);
    if (!(await mayReceiveImages(modelId))) return noVisionOutcome(result, approval);
    return {
      ...resultOutcome(result, approval),
      attachments: [toolImageRef(attachment, crypto.randomUUID())],
    };
  } catch (err) {
    return failedOutcome(errorMessage(err), approval);
  }
}

/** True when the model's settings scan confirms it can view images. No model, or no readable scan, means no. */
async function mayReceiveImages(modelId: string | null): Promise<boolean> {
  if (!modelId) return false;
  const entries = await loadModelCapabilities(modelId).catch(() => null);
  return attachmentGate("image", entries).allowed;
}

/** Adds a tool row to the chat and stores it at once, so a crash keeps every result already made. */
function addToolRow(sessionId: string, call: ChatToolCall, outcome: ToolOutcome): void {
  const row = buildToolMessage(call, outcome, crypto.randomUUID(), Date.now());
  useChatStore.getState().addMessage(sessionId, row);
  db.saveMessage(sessionId, row).catch((err: unknown) => {
    console.warn("[tools] Could not save a tool result:", err);
  });
}

/** After a stop, records a cancelled row for each call still without a result, so every call is answered. */
function cancelUnanswered(sessionId: string): void {
  for (const call of pendingToolCalls(messagesOf(sessionId))) {
    addToolRow(sessionId, call, cancelledOutcome());
  }
}

/**
 * The request that follows a round, with the results so far. It offers tools unless the round limit
 * is reached; then the model must answer in plain text. Resolves with the request's failure, or null.
 */
async function requestAfterRound(
  sessionId: string,
  run: ModelRun,
  rounds: number,
): Promise<SendFailure | null> {
  if (!toolsAllowedAfter(rounds)) {
    toast.info(
      "Tool limit reached",
      `The model used tools ${MAX_ROUNDS} times in this reply. It must answer without them now.`,
    );
  }
  const tools = toolsAllowedAfter(rounds) ? await toolsForRun(sessionId, run) : undefined;
  let history: ChatMessage[];
  try {
    history = await historyNow(sessionId);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  return streamReply(sessionId, history, run, tools);
}

/** The history of the chat as the server takes it now. Files that are no longer there are named once. */
async function historyNow(sessionId: string): Promise<ChatMessage[]> {
  const built = await historyFor(messagesOf(sessionId));
  if (built.unavailable.length > 0) warnUnavailable(built.unavailable);
  return built.history;
}

/**
 * The tool definitions a request offers: every tool whose state is not off and that is not switched
 * off for this chat. Undefined when none is on, or when the model's scan says it does not call tools.
 * An unknown or untested scan allows tools.
 */
export async function toolsForRun(
  sessionId: string,
  run: ModelRun,
): Promise<ToolDefinition[] | undefined> {
  const store = useToolStore.getState();
  const { states, enabledSearchSources, searchSources, allowedFolders } = store;
  const chatTools = store.tools.filter((spec) => store.isToolEnabledInChat(sessionId, spec.name));
  const offered = offeredTools(
    chatTools,
    states,
    enabledSearchSources,
    searchSources,
    allowedFolders,
  );
  if (offered.length === 0) return undefined;
  if (run.modelId && (await modelRefusesTools(run.modelId))) return undefined;
  return offered;
}

async function modelRefusesTools(modelId: string): Promise<boolean> {
  const entries = await loadModelCapabilities(modelId).catch(() => []);
  return toolCallsRefused(entries);
}
