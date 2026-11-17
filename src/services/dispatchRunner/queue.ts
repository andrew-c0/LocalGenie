import { useDispatchStore } from "../../stores/dispatchStore";
import { useModelStore } from "../../stores/modelStore";
import type { DispatchTask, Message } from "../../types";
import { freshStallState } from "../../utils/dispatchGuards";
import type { TurnEnd } from "../../utils/dispatchTask";
import { errorMessage } from "../../utils/errorMessage";
import { showChatError } from "../chatRun";
import { finishStreaming } from "./chatGate";
import { loadRecordedModel } from "./modelSwitch";
import { announceTurnEnd } from "./notices";
import { addMessage, recordEnd, recordModel } from "./records";
import {
  dequeue,
  enqueue,
  findTask,
  hasQueued,
  isTurnRunning,
  queuedStartRefusal,
  setCurrentTurn,
  type Turn,
} from "./state";
import { runLoop } from "./turnLoop";

/**
 * How a turn starts. A sent message stores its prompt first. A continued conversation loads the model it
 * recorded before its turn, when another model is loaded; a queued one always does, so each conversation runs
 * on its own model.
 */
interface StartPlan {
  /** The message the turn starts with, or null when it continues from the stored messages. */
  prompt: Message | null;
  loadsRecordedModel: boolean;
}

/**
 * Starts the turn now when none runs, else queues the conversation behind the running one. A start that fails
 * (its model cannot load) rejects, and the conversation keeps its status.
 */
export async function startOrQueue(task: DispatchTask, plan: StartPlan): Promise<void> {
  if (!isTurnRunning() && !hasQueued()) {
    await beginTurn(task, plan);
    return;
  }
  await useDispatchStore.getState().update(task.id, { status: "queued" });
  if (plan.prompt) addMessage(task.sessionId, plan.prompt);
  enqueue(task.id);
  // The running turn may have ended while the status was saved. Then nothing else would start this one.
  if (!isTurnRunning()) await startNextQueued();
}

/**
 * Marks the conversation running and starts its turn loop. The turn is the running one from the start, so
 * nothing else starts while the recorded model loads. A failed start rejects and leaves nothing running.
 */
async function beginTurn(task: DispatchTask, plan: StartPlan): Promise<void> {
  const turn: Turn = {
    taskId: task.id,
    sessionId: task.sessionId,
    modelId: null,
    stopRequested: false,
    errorShown: false,
    guard: freshStallState(),
    samplingLogged: false,
  };
  setCurrentTurn(turn);
  // Running from the start, so the chat input stays off while the recorded model loads.
  try {
    await useDispatchStore
      .getState()
      .update(task.id, { status: "running", startedAt: Date.now(), error: null });
  } catch (err) {
    setCurrentTurn(null);
    throw err;
  }
  try {
    if (plan.loadsRecordedModel) await loadRecordedModel(task.sessionId);
  } catch (err) {
    setCurrentTurn(null);
    await restoreStatus(task);
    throw err;
  }
  turn.modelId = useModelStore.getState().activeModelId;
  if (turn.modelId !== null) recordModel(task.sessionId, turn.modelId);
  if (plan.prompt) addMessage(task.sessionId, plan.prompt);
  void runTurn(turn);
}

/**
 * Starts the first queued conversation that can run. One whose model cannot run it is failed with its reason,
 * and the next one is tried.
 */
export async function startNextQueued(): Promise<void> {
  if (isTurnRunning()) return;
  const task = nextQueuedTask();
  if (!task) return;
  const refusal = queuedStartRefusal(task);
  if (refusal) {
    await failQueued(task, refusal);
    return startNextQueued();
  }
  try {
    await beginTurn(task, { prompt: null, loadsRecordedModel: true });
  } catch (err) {
    await failQueued(task, errorMessage(err));
    return startNextQueued();
  }
}

/** The first queued conversation that still exists and is queued. It leaves the queue. */
function nextQueuedTask(): DispatchTask | null {
  for (let id = dequeue(); id !== undefined; id = dequeue()) {
    const task = findTask(id);
    if (task?.status === "queued") return task;
  }
  return null;
}

/**
 * Puts a conversation back to the status it had before a start that failed, so a failed start leaves it as it
 * was. A failed save is kept in the store, the same way a failed end is.
 */
async function restoreStatus(task: DispatchTask): Promise<void> {
  try {
    await useDispatchStore.getState().update(task.id, { status: task.status });
  } catch (err) {
    console.warn("[dispatch] Could not restore a conversation's status:", err);
    const current = findTask(task.id) ?? task;
    useDispatchStore.getState().applyTask({ ...current, status: task.status });
  }
}

/** Ends a queued conversation that could not start: its status is failed and the reason is in the transcript. */
async function failQueued(task: DispatchTask, reason: string): Promise<void> {
  await recordEnd(task.id, { status: "failed", error: reason });
  showChatError(task.sessionId, { error: reason });
}

/** Runs a turn to its end, then ends it. */
async function runTurn(turn: Turn): Promise<void> {
  const end = await runLoopSafely(turn);
  await finishTurn(turn, end);
}

/** The loop's end. An error that escapes it ends the turn as failed, so every turn gets an end. */
async function runLoopSafely(turn: Turn): Promise<TurnEnd> {
  try {
    return await runLoop(turn);
  } catch (err) {
    return { status: "failed", error: errorMessage(err) };
  }
}

/**
 * Ends a turn. The streaming state and the running turn are cleared first and always, so a failed write below
 * cannot leave the runner busy. The model is freed before the end is written, so the chat input reads the end at
 * its next render. Then the end is written and announced, and the next queued conversation starts.
 */
async function finishTurn(turn: Turn, end: TurnEnd): Promise<void> {
  try {
    finishStreaming();
  } finally {
    setCurrentTurn(null);
  }
  try {
    await recordEnd(turn.taskId, end);
    if (end.status === "failed" && !turn.errorShown) {
      showChatError(turn.sessionId, { error: end.error });
    }
    announceTurnEnd(end);
  } catch (err) {
    console.warn("[dispatch] Could not finish a turn:", err);
  }
  await startNextQueued();
}
