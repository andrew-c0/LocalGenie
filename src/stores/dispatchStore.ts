import { create } from "zustand";
import {
  createDispatchTask,
  deleteDispatchTask,
  listDispatchTasks,
  updateDispatchTask,
} from "../services/dispatch";
import type { DispatchPatch, DispatchTask } from "../types";
import { isWorking, newDispatchSession, runningTaskIdOf } from "../utils/dispatchTask";
import { useChatStore } from "./chatStore";

interface DispatchState {
  /** Every Dispatch conversation, newest first. Empty until loaded. */
  tasks: DispatchTask[];
  /** True once the list has been read. */
  loaded: boolean;
  /** The first-load failure, kept as the raw error. Null when the last load worked or has not failed. */
  loadError: unknown;
  /** The conversation whose turn uses the model now (status running or needs_you), or null. The chat input waits while it is set. */
  runningTaskId: string | null;
  /** Reads the conversation list. Safe to call again to retry. */
  load: () => Promise<void>;
  /**
   * Creates a queued conversation and its session, titled by the goal (the first message). Resolves with
   * the conversation; rejects when it cannot be created.
   */
  create: (goal: string, allowedTools: string[]) => Promise<DispatchTask>;
  /** Saves a change to a conversation and shows it as it is now. Rejects when the save fails. */
  update: (id: string, patch: DispatchPatch) => Promise<DispatchTask>;
  /** Removes a conversation and its session. A conversation whose turn is working cannot be removed. */
  remove: (id: string) => Promise<void>;
  /** Puts a conversation into the list (replacing the one with its id) and keeps `runningTaskId` in step with it. */
  applyTask: (task: DispatchTask) => void;
}

/** The list with `task` in place of the one with its id, or first when it is new. */
function withTask(tasks: readonly DispatchTask[], task: DispatchTask): DispatchTask[] {
  const exists = tasks.some((item) => item.id === task.id);
  if (!exists) return [task, ...tasks];
  return tasks.map((item) => (item.id === task.id ? task : item));
}

/**
 * The running conversation after one changes: a conversation that now runs becomes the running one; the
 * running one stops being it when its status moves on.
 */
function runningTaskIdAfter(current: string | null, task: DispatchTask): string | null {
  if (isWorking(task.status)) return task.id;
  return current === task.id ? null : current;
}

/** The Dispatch conversation list and the one whose turn uses the model. Its loop lives in `services/dispatchRunner/`. */
export const useDispatchStore = create<DispatchState>((set, get) => ({
  tasks: [],
  loaded: false,
  loadError: null,
  runningTaskId: null,

  load: async () => {
    try {
      const tasks = await listDispatchTasks();
      set({ tasks, loaded: true, loadError: null, runningTaskId: runningTaskIdOf(tasks) });
    } catch (err) {
      console.warn("[dispatch] Could not load the conversations:", err);
      set({ loadError: err });
    }
  },

  create: async (goal, allowedTools) => {
    const task = await createDispatchTask(goal, allowedTools);
    useChatStore.getState().addSession(newDispatchSession(task));
    get().applyTask(task);
    return task;
  },

  update: async (id, patch) => {
    const task = await updateDispatchTask(id, patch);
    get().applyTask(task);
    return task;
  },

  remove: async (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (task && isWorking(task.status)) {
      throw new Error("Stop the conversation before deleting it.");
    }
    await deleteDispatchTask(id);
    set((state) => ({ tasks: state.tasks.filter((item) => item.id !== id) }));
    if (task) useChatStore.getState().deleteSession(task.sessionId);
  },

  applyTask: (task) => {
    set((state) => ({
      tasks: withTask(state.tasks, task),
      runningTaskId: runningTaskIdAfter(state.runningTaskId, task),
    }));
  },
}));
