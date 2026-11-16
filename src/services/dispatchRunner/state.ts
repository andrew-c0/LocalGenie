import { useChatStore } from "../../stores/chatStore";
import { useDispatchStore } from "../../stores/dispatchStore";
import { useModelStore } from "../../stores/modelStore";
import type { DispatchTask } from "../../types";
import { type OwnState, serverModelRefusal } from "../../utils/dispatchStart";

/** The turn in progress: the conversation it belongs to and what it needs to run. */
export interface Turn {
  taskId: string;
  sessionId: string;
  /** The model the turn runs on, set once it is loaded. A step on another model fails the turn. */
  modelId: string | null;
  stopRequested: boolean;
  /** True once the failure was written into the transcript, so it is not written twice. */
  errorShown: boolean;
}

/** The turn in progress, or null when none runs. Only the runner changes it, through the functions below. */
let activeTurn: Turn | null = null;

/** Conversations waiting for the running turn, in the order they were sent to. */
const queue: string[] = [];

export function currentTurn(): Turn | null {
  return activeTurn;
}

export function setCurrentTurn(turn: Turn | null): void {
  activeTurn = turn;
}

export function isTurnRunning(): boolean {
  return activeTurn !== null;
}

export function enqueue(taskId: string): void {
  queue.push(taskId);
}

/** The next conversation id in the queue, which leaves the queue. Undefined when the queue is empty. */
export function dequeue(): string | undefined {
  return queue.shift();
}

/** True when a conversation waits in the queue. A message does not start a turn past it. */
export function hasQueued(): boolean {
  return queue.length > 0;
}

export function isQueued(taskId: string): boolean {
  return queue.includes(taskId);
}

export function removeFromQueue(taskId: string): void {
  const index = queue.indexOf(taskId);
  if (index >= 0) queue.splice(index, 1);
}

/** Where a conversation stands in the runner: its turn, its place in the queue, or neither. */
export function ownStateOf(taskId: string): OwnState {
  if (activeTurn?.taskId === taskId) return "working";
  if (queue.includes(taskId)) return "queued";
  return "idle";
}

/** The model side of a start check: the server runs and a model is loaded. */
export function modelState(): { serverRunning: boolean; modelLoaded: boolean } {
  const model = useModelStore.getState();
  return { serverRunning: model.serverStatus.running, modelLoaded: model.activeModelId !== null };
}

/**
 * The model side of a start check for a conversation that loads its own model first. A conversation with a
 * recorded model passes: the load starts the server if it is stopped and loads the model, so neither needs to be
 * up beforehand. Without a recorded model the server and a loaded model are required, as for a new message.
 */
export function loadableState(task: DispatchTask): {
  serverRunning: boolean;
  modelLoaded: boolean;
} {
  if (recordedModelOf(task.sessionId) !== undefined)
    return { serverRunning: true, modelLoaded: true };
  return modelState();
}

/**
 * The model side of a message to a conversation. One with a recorded model needs no loaded model: its turn loads
 * that model first, as a continue or a queued start does. Without one (or a new conversation) the server and a
 * loaded model are required.
 */
export function sendModelState(taskId: string | null): {
  serverRunning: boolean;
  modelLoaded: boolean;
} {
  const task = taskId === null ? undefined : findTask(taskId);
  return task ? loadableState(task) : modelState();
}

/** Why the server cannot run the conversation now, or null. Used before a queued conversation starts. */
export function queuedStartRefusal(task: DispatchTask): string | null {
  return serverModelRefusal(loadableState(task));
}

/** The model a conversation's session recorded at its last turn, or undefined when it never ran one. */
export function recordedModelOf(sessionId: string): string | undefined {
  return useChatStore.getState().sessions.find((session) => session.id === sessionId)?.modelId;
}

export function findTask(taskId: string): DispatchTask | undefined {
  return useDispatchStore.getState().tasks.find((item) => item.id === taskId);
}

export function taskNamed(taskId: string): DispatchTask {
  const task = findTask(taskId);
  if (!task) throw new Error("This conversation no longer exists.");
  return task;
}
