/**
 * The Dispatch runner. A conversation sends a message and gets a turn: a loop of model calls and tool calls
 * with no step or time cap, until a reply has no tool call (its text is the answer), the user stops it, or
 * an error ends it. One turn runs at a time, app-wide, as a plain async loop in the frontend. A message to
 * another conversation while a turn runs is queued and starts when the running turn ends, first in first
 * out. The store holds each conversation as the database has it; the turn and the queue are kept in
 * `state.ts`. The other modules: `turnLoop` (the steps), `toolCalls` (a reply's calls), `queue` (start, queue
 * and end), `modelSwitch` (the model a conversation recorded), `records` (writes), `notices` and `chatGate`.
 */
import { messagesOf, useChatStore } from "../../stores/chatStore";
import { useDispatchStore } from "../../stores/dispatchStore";
import { useToolApprovalStore } from "../../stores/toolApprovalStore";
import {
  continueAction,
  FINISHED_REPORT_MAX_CHARS,
  finalAnswerOf,
} from "../../utils/dispatchContinue";
import { turnRefusal } from "../../utils/dispatchStart";
import { canContinue, cutChars } from "../../utils/dispatchTask";
import { startOrQueue } from "./queue";
import { recordEnd, userMessage } from "./records";
import {
  currentTurn,
  isQueued,
  isTurnRunning,
  loadableState,
  ownStateOf,
  removeFromQueue,
  sendModelState,
  taskNamed,
} from "./state";
import { interruptModel } from "./turnLoop";

/**
 * Why a message cannot be sent to a conversation now, or null when it can. A new conversation has no id yet
 * and passes null. The page and the runner both use this one function. Another conversation running does
 * not refuse: the message is queued.
 */
export function turnBlockReason(taskId: string | null): string | null {
  return turnRefusal({
    own: taskId === null ? "idle" : ownStateOf(taskId),
    chatBusy: chatBlocksTurn(),
    ...sendModelState(taskId),
  });
}

/** A chat reply or summary holds the model. Not a Dispatch turn of its own, which is checked separately. */
function chatBlocksTurn(): boolean {
  const chat = useChatStore.getState();
  return !isTurnRunning() && (chat.isStreaming || chat.compacting);
}

/**
 * Sends a message to a conversation. It is stored as the next user message, and a turn runs on it (or it is
 * queued behind the running turn). Rejects with the reason when it cannot be sent.
 */
export async function sendMessage(taskId: string, text: string): Promise<void> {
  const content = text.trim();
  if (content === "") throw new Error("Type a message before sending it.");
  const refusal = turnBlockReason(taskId);
  if (refusal) throw new Error(refusal);
  await startOrQueue(taskNamed(taskId), {
    prompt: userMessage(content),
    loadsRecordedModel: true,
  });
}

/**
 * Continues a stopped or interrupted conversation from its stored messages, without a new message. The model it
 * recorded is loaded first when another is loaded. A conversation behind a running turn is queued. Rejects with
 * the reason when it cannot continue; it then keeps its status. A conversation whose last reply already answers it
 * is only ended as done: no request is made, the model is not loaded and no notice is sent.
 */
export async function continueTask(taskId: string): Promise<void> {
  const task = taskNamed(taskId);
  if (!canContinue(task.status)) {
    throw new Error(
      `Only a stopped or interrupted conversation can continue. This one is ${task.status}.`,
    );
  }
  const messages = messagesOf(task.sessionId);
  if (continueAction(messages) === "finished") {
    await recordEnd(taskId, {
      status: "done",
      answer: cutChars(finalAnswerOf(messages), FINISHED_REPORT_MAX_CHARS),
    });
    return;
  }
  const refusal = turnRefusal({
    own: ownStateOf(taskId),
    chatBusy: chatBlocksTurn(),
    ...loadableState(task),
  });
  if (refusal) throw new Error(refusal);
  await startOrQueue(task, { prompt: null, loadsRecordedModel: true });
}

/**
 * Stops a conversation. A running turn ends at its next check, after the reply in progress and any approval
 * question are cancelled. A
 * queued conversation leaves the queue and is marked stopped. Other conversations are left as they are.
 */
export async function stopTask(taskId: string): Promise<void> {
  const turn = currentTurn();
  if (turn?.taskId === taskId) {
    turn.stopRequested = true;
    // A tool call that waits for approval (the conversation reads Needs you) is answered cancel, so the turn ends.
    useToolApprovalStore.getState().cancelApprovalsFor(turn.sessionId);
    await interruptModel();
    return;
  }
  if (isQueued(taskId)) {
    removeFromQueue(taskId);
    await useDispatchStore.getState().update(taskId, { status: "stopped", finishedAt: Date.now() });
  }
}
