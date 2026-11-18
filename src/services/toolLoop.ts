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
  // The run owns the model between its requests too, when no stream is open (see `replyBelongsTo`).
  useChatStore.getState().setToolRunSessionId(sessionId);
  try {
    return await loopRounds(sessionId, run);
  } finally {
    const chat = useChatStore.getState();
    chat.setStreaming(false);
    chat.setActiveStream(null);
    chat.setToolRunSessionId(null);
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
    addToolRow(sessionId, call, await outcomeForCall(chatRunRules(sessionId), call, modelId));
  }
  for (const call of split.skipped) addToolRow(sessionId, call, skippedOutcome());
}

/**
 * Who decides the calls of one run: the session it belongs to (its grants and its approval requests use it),
 * the state each tool has in this kind of run, which tools are switched on for the session, and how the user is
 * asked about a tool set to Request approval.
 */
export interface RunRules {
  sessionId: string;
  /** The state of a tool in this run: the chat state for a chat, the Dispatch state for a conversation. */
  stateOf: (name: string) => ToolState;
  /** True when the tool is switched on for this run. A tool that is not gets an off result. */
  switchedOn: (name: string) => boolean;
  /** Asks the user about one call. Resolves with the answer. */
  ask: (call: ChatToolCall) => Promise<ApprovalDecision>;
  /** The longest a tool result may be, in characters, in this run. Undefined leaves the backend default. */
  resultMaxChars?: number;
}

/**
 * The rules of a run in a session. The caller gives the state of each tool, how the user is asked, and the result
 * budget of the run (none for a chat).
 */
export function runRules(
  sessionId: string,
  stateOf: (name: string) => ToolState,
  ask: (call: ChatToolCall) => Promise<ApprovalDecision>,
  resultMaxChars?: number,
): RunRules {
  return {
    sessionId,
    stateOf,
    switchedOn: (name) => useToolStore.getState().isToolEnabledInChat(sessionId, name),
    ask,
    resultMaxChars,
  };
}

/** The rules of a chat run: the chat states, and the chat's approval dialog. */
export function chatRunRules(sessionId: string): RunRules {
  return runRules(
    sessionId,
    (name) => useToolStore.getState().states[name] ?? "off",
    (call) => requestToolApproval(sessionId, call),
  );
}

/**
 * The outcome of one call in a run, the same rule for a chat and a Dispatch conversation. An unknown tool is an
 * error. A tool that is Off or switched off for the run is left out. A tool with no search source is not offered.
 * A tool set to On runs. A tool set to Request approval runs once the session has its grant, and otherwise waits
 * for `rules.ask`. Resolves with the result, or with denied, cancelled or off.
 */
export async function outcomeForCall(
  rules: RunRules,
  call: ChatToolCall,
  modelId: string | null,
): Promise<ToolOutcome> {
  const tools = useToolStore.getState();
  const spec = tools.tools.find((item) => item.name === call.name);
  if (!spec) return unknownToolOutcome(call.name);

  const state = rules.stateOf(call.name);
  const granted = tools.hasChatGrant(rules.sessionId, call.name);
  const access = toolAccess(state, granted);
  if (access === "skip" || !rules.switchedOn(call.name)) return offOutcome();
  if (!isOfferable(spec, tools.enabledSearchSources, tools.searchSources)) {
    return noSourceOutcome();
  }
  const run = (approval: ToolApproval) => runCall(call, approval, modelId, rules.resultMaxChars);
  if (access === "run") return run(state === "on" ? "auto" : "chat");

  const decision = await rules.ask(call);
  switch (decision) {
    case "deny":
      return deniedOutcome();
    case "cancel":
      return cancelledOutcome();
    case "chat":
      useToolStore.getState().grantForChat(rules.sessionId, call.name);
      return run("chat");
    case "once":
      return run("once");
  }
}

/** Asks the user about one call in the approval dialog. The request is for `sessionId`, so Stop can cancel it. */
export function requestToolApproval(
  sessionId: string,
  call: ChatToolCall,
): Promise<ApprovalDecision> {
  return useToolApprovalStore.getState().requestApproval({
    id: crypto.randomUUID(),
    sessionId,
    toolName: call.name,
    arguments: call.arguments,
  });
}

/**
 * Runs a call with the saved folders. A thrown error becomes an error outcome, so the model still gets a
 * result. A successful image result is kept only when the model may receive images. The result is capped at
 * `resultMaxChars` when the run sets a budget (a Dispatch conversation); a chat passes none.
 */
async function runCall(
  call: ChatToolCall,
  approval: ToolApproval,
  modelId: string | null,
  resultMaxChars: number | undefined,
): Promise<ToolOutcome> {
  try {
    const tools = useToolStore.getState();
    const result = await executeTool(
      call.name,
      call.arguments,
      tools.allowedFolders,
      activeSourceIds(tools.enabledSearchSources, tools.searchSources),
      resultMaxChars,
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
export function addToolRow(sessionId: string, call: ChatToolCall, outcome: ToolOutcome): void {
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

export async function modelRefusesTools(modelId: string): Promise<boolean> {
  const entries = await loadModelCapabilities(modelId).catch(() => []);
  return toolCallsRefused(entries);
}
