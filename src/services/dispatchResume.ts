import { useChatStore } from "../stores/chatStore";
import { useDispatchStore } from "../stores/dispatchStore";
import { useModelStore } from "../stores/modelStore";
import type { DispatchTask } from "../types";
import { cutChars, patchForEnd, TITLE_MAX_CHARS } from "../utils/dispatchTask";
import { errorMessage } from "../utils/errorMessage";
import { shortModelKey } from "../utils/modelKey";
import { toast } from "../utils/toast";
import { continueTask } from "./dispatchRunner";

/**
 * Continues the interrupted conversations in the order given. The first one loads the model it recorded (the
 * runner does that, and a load shows a progress toast since the user is waiting); the others queue behind it,
 * each loading its own model when its turn starts. A conversation that cannot continue keeps its status, and an
 * error toast names the reason.
 */
export async function continueInterrupted(tasks: readonly DispatchTask[]): Promise<void> {
  const first = tasks[0];
  const model = first ? recordedModelOf(first) : null;
  if (model !== null && !isActive(model)) toast.info("Loading model", model);
  for (const task of tasks) {
    try {
      await continueTask(task.id);
    } catch (err) {
      toast.error(`Could not continue "${titleOf(task)}"`, errorMessage(err));
    }
  }
}

/**
 * Marks the conversations stopped, so the offer does not return on the next start. They stay in the list and can
 * still be continued by hand.
 */
export async function stopInterrupted(tasks: readonly DispatchTask[]): Promise<void> {
  const finishedAt = Date.now();
  for (const task of tasks) {
    try {
      await useDispatchStore
        .getState()
        .update(task.id, patchForEnd({ status: "stopped" }, finishedAt));
    } catch (err) {
      toast.error(`Could not update "${titleOf(task)}"`, errorMessage(err));
    }
  }
}

function titleOf(task: DispatchTask): string {
  return cutChars(task.goal, TITLE_MAX_CHARS);
}

function recordedModelOf(task: DispatchTask): string | null {
  return useChatStore.getState().sessions.find((s) => s.id === task.sessionId)?.modelId ?? null;
}

function isActive(model: string): boolean {
  const active = useModelStore.getState().activeModelId;
  return active !== null && shortModelKey(active) === shortModelKey(model);
}
