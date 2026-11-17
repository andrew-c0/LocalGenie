import { messagesOf, overridesOf } from "../../stores/chatStore";
import { useDispatchStore } from "../../stores/dispatchStore";
import type { Message } from "../../types";
import { isContextOverflow } from "../../utils/chatError";
import { effectiveCompaction } from "../../utils/compactionSettings";
import { compactionDue } from "../../utils/compactionTrigger";
import { stepLogLine } from "../../utils/dispatchLog";
import { CONTINUE_TEXT, dispatchPromptBlock, notesMessageText } from "../../utils/dispatchPrompt";
import { modelChangeFault } from "../../utils/dispatchStart";
import type { TurnEnd } from "../../utils/dispatchTask";
import { errorMessage } from "../../utils/errorMessage";
import { resultBudgetChars } from "../../utils/resultBudget";
import { isSystemEvent } from "../../utils/systemEvents";
import { parseThinking } from "../../utils/thinking";
import { toast } from "../../utils/toast";
import { cancelledOutcome } from "../../utils/toolLoop";
import { isReplyMessage } from "../../utils/toolRecords";
import { stopSummary, summariseConversation } from "../chatCompaction";
import { historyFor, warnUnavailable } from "../chatHistory";
import {
  type ModelRun,
  resolveModelRun,
  type SendFailure,
  showChatError,
  streamReply,
} from "../chatRun";
import { getCompactionSettings } from "../compaction";
import * as geniex from "../geniex";
import { modelRefusesTools } from "../toolLoop";
import { finishStreaming, waitForChatIdle } from "./chatGate";
import { addMessage, userMessage } from "./records";
import { type Turn, taskNamed } from "./state";
import { answerPendingCalls, conversationTools, runCalls } from "./toolCalls";

/**
 * Runs the steps of a turn until it ends and returns how it ended. A step is one model call and the tool calls
 * it makes; the turn ends when a reply has no tool call, the user stops it, or an error ends it. An error that
 * escapes a step fails the turn. The caller records the end.
 */
export async function runLoop(turn: Turn): Promise<TurnEnd> {
  try {
    // Calls that have no result yet (the app stopped on them) get a cancelled one, so the history stays valid.
    answerPendingCalls(turn.sessionId, cancelledOutcome());
    return await driveTurn(turn);
  } catch (err) {
    return { status: "failed", error: errorMessage(err) };
  }
}

async function driveTurn(turn: Turn): Promise<TurnEnd> {
  let end: TurnEnd | null = null;
  while (end === null) end = await runStep(turn, false);
  return end;
}

/**
 * One model call and the tool calls it makes. Before the call: a stop ends the turn, the model must be the one
 * the turn started on and call tools, and the context is summarised when due. A context overflow summarises
 * once and retries.
 */
async function runStep(turn: Turn, overflowRetried: boolean): Promise<TurnEnd | null> {
  if (turn.stopRequested) return { status: "stopped" };
  await waitForChatIdle();
  if (turn.stopRequested) return { status: "stopped" };
  const model = await resolveModelRun(turn.sessionId);
  const fault = modelChangeFault(turn.modelId, model.modelId);
  if (fault) return { status: "failed", error: fault };
  if (model.modelId !== null && (await modelRefusesTools(model.modelId))) {
    return {
      status: "failed",
      error:
        "The model does not call tools (its settings scan says so), so a Dispatch conversation cannot run on it.",
    };
  }
  logSamplingOnce(turn, model);
  await compactIfDue(turn, model);
  if (turn.stopRequested) return { status: "stopped" };
  return sendStep(turn, model, overflowRetried);
}

/**
 * Logs the sampling the turn runs with, once per turn, so the user can check a Dispatch conversation uses its
 * profile. The values are the effective ones: the profile, then the chat's overrides.
 */
function logSamplingOnce(turn: Turn, model: ModelRun): void {
  if (turn.samplingLogged) return;
  turn.samplingLogged = true;
  console.info("[dispatch] sampling:", {
    temperature: model.settings.temperature,
    topP: model.settings.topP,
    repetitionPenalty: model.settings.repetitionPenalty,
  });
}

/** Summarises the conversation when the context reaches the threshold. Its compaction is on by session override. */
async function compactIfDue(turn: Turn, model: ModelRun): Promise<void> {
  const settings = effectiveCompaction(await getCompactionSettings(), overridesOf(turn.sessionId));
  const messages = messagesOf(turn.sessionId);
  const prompt = lastSpokenMessage(messages);
  if (!prompt) return;
  const due = compactionDue({
    enabled: settings.enabled,
    thresholdPercent: settings.thresholdPercent,
    messages,
    prompt,
    windowTokens: model.contextWindow,
  });
  if (due) await summarise(turn, model);
}

/** Summarises the conversation and adds the line after the summary. True when the summary was stored. */
async function summarise(turn: Turn, model: ModelRun): Promise<boolean> {
  const outcome = await summariseConversation(turn.sessionId, model);
  if (outcome.status === "done") {
    addMessage(turn.sessionId, userMessage(CONTINUE_TEXT));
    return true;
  }
  if (outcome.status === "failed") toast.error("Summary failed", outcome.reason);
  return false;
}

/** The newest message that is not a system line. The context is counted up to it. */
function lastSpokenMessage(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!isSystemEvent(messages[i])) return messages[i];
  }
  return undefined;
}

/** How many times an empty reply is asked for again, as the same step, before the turn fails. */
export const EMPTY_REPLY_RETRIES = 2;

/** The turn's failure when the model returned an empty reply on every try of a step (the first try and each retry). */
export const EMPTY_REPLY_FAILURE = `The model returned an empty reply ${EMPTY_REPLY_RETRIES + 1} times in a row. Send a message to continue, or try another model.`;

/** Where a request stands within its step: the step's number and the empty replies asked for again so far. */
interface RequestAttempt {
  step: number;
  emptyRetries: number;
}

/**
 * Starts a step: numbers it in the record, then sends its first request. The step counter is written for the
 * record; it is not shown.
 */
async function sendStep(
  turn: Turn,
  model: ModelRun,
  overflowRetried: boolean,
): Promise<TurnEnd | null> {
  const updated = await useDispatchStore
    .getState()
    .update(turn.taskId, { steps: taskNamed(turn.taskId).steps + 1 });
  return requestStep(turn, model, overflowRetried, { step: updated.steps, emptyRetries: 0 });
}

/**
 * Sends one request with the conversation's history, its notes and its tools, then handles the reply. A request
 * that returns no reply (no text and no call) is sent again with the same history, up to EMPTY_REPLY_RETRIES
 * times. A retry is the same step: no message is added and the step number does not change.
 */
async function requestStep(
  turn: Turn,
  model: ModelRun,
  overflowRetried: boolean,
  attempt: RequestAttempt,
): Promise<TurnEnd | null> {
  const { history, unavailable } = await historyFor(messagesOf(turn.sessionId));
  if (unavailable.length > 0) warnUnavailable(unavailable);
  // The system prompt is the same for every request; the notes go last, for this request only.
  const request: ModelRun = {
    ...model,
    systemBlocks: [...model.systemBlocks, dispatchPromptBlock()],
  };
  const sent = historyWithNotes(history, taskNamed(turn.taskId).notes);
  const messageCountBefore = messagesOf(turn.sessionId).length;
  const failure = await streamReply(
    turn.sessionId,
    sent,
    request,
    conversationTools(turn.sessionId),
  );
  finishStreaming();
  const reply = lastReply(messagesOf(turn.sessionId).slice(messageCountBefore));
  console.info(stepLogLine(attempt.step, reply));
  if (failure) return onStreamFailure(turn, model, failure, overflowRetried);
  if (!reply && !turn.stopRequested && attempt.emptyRetries < EMPTY_REPLY_RETRIES) {
    const retry = attempt.emptyRetries + 1;
    console.warn(
      `[dispatch] Step ${attempt.step} returned an empty reply; sending it again (retry ${retry} of ${EMPTY_REPLY_RETRIES}).`,
    );
    return retryRequest(turn, overflowRetried, { ...attempt, emptyRetries: retry });
  }
  return handleReply(turn, reply, model);
}

/**
 * The history one request sends: the stored messages, then the notes as a user message when there are notes. The
 * message is for this request only. It is not stored or shown, and it comes last, so the prompt before it does
 * not change when the notes do.
 */
export function historyWithNotes(
  history: geniex.ChatMessage[],
  notes: string,
): geniex.ChatMessage[] {
  const text = notesMessageText(notes);
  return text === null ? history : [...history, { role: "user", content: text }];
}

/**
 * Sends a step's request again after an empty reply. The model must still be the one the turn started on, as
 * at a step's start, so a change of model fails the turn here too.
 */
async function retryRequest(
  turn: Turn,
  overflowRetried: boolean,
  attempt: RequestAttempt,
): Promise<TurnEnd | null> {
  const model = await resolveModelRun(turn.sessionId);
  const fault = modelChangeFault(turn.modelId, model.modelId);
  if (fault) return { status: "failed", error: fault };
  return requestStep(turn, model, overflowRetried, attempt);
}

/** A failed request: a context overflow summarises and retries once; anything else ends the turn. */
async function onStreamFailure(
  turn: Turn,
  model: ModelRun,
  failure: SendFailure,
  overflowRetried: boolean,
): Promise<TurnEnd | null> {
  if (isContextOverflow(failure.error) && !overflowRetried && (await summarise(turn, model))) {
    return runStep(turn, true);
  }
  if (turn.stopRequested) return { status: "stopped" };
  turn.errorShown = true;
  showChatError(turn.sessionId, failure);
  return { status: "failed", error: failure.error };
}

/**
 * The end of a step from its reply. A reply with calls runs them and the turn goes on, unless the stall guard ends
 * it. A reply with no call is the answer: the turn ends as done with its text. Each result is capped at the
 * model's result budget.
 */
async function handleReply(
  turn: Turn,
  reply: Message | undefined,
  model: ModelRun,
): Promise<TurnEnd | null> {
  if (turn.stopRequested) {
    answerPendingCalls(turn.sessionId, cancelledOutcome());
    return { status: "stopped" };
  }
  if (!reply) return { status: "failed", error: EMPTY_REPLY_FAILURE };
  const calls = reply.toolCalls ?? [];
  if (calls.length === 0)
    return { status: "done", answer: parseThinking(reply.content).answer.trim() };
  return runCalls(turn, calls, resultBudgetChars(model.contextWindow));
}

function lastReply(messages: Message[]): Message | undefined {
  const replies = messages.filter(isReplyMessage);
  return replies[replies.length - 1];
}

/** Asks the model to stop: the reply in progress and any summary. Best effort; the loop ends at its next check. */
export async function interruptModel(): Promise<void> {
  try {
    await geniex.cancelChatCompletion();
  } catch (err) {
    console.warn("[dispatch] Could not cancel the reply:", err);
  }
  try {
    await stopSummary();
  } catch (err) {
    console.warn("[dispatch] Could not stop the summary:", err);
  }
}
