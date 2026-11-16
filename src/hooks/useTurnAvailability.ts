import { turnBlockReason } from "../services/dispatchRunner";
import { useChatStore } from "../stores/chatStore";
import { useDispatchStore } from "../stores/dispatchStore";
import { useModelStore } from "../stores/modelStore";
import { queuedNoteFor } from "../utils/dispatchStart";

/** Whether a message can be sent to a conversation now, and the note shown when it will be queued. */
export interface TurnAvailability {
  /** Why the message cannot be sent now, or null when it can. */
  blocker: string | null;
  /** Shown under the field when another conversation runs: the message is queued. Null otherwise. */
  queuedNote: string | null;
}

/**
 * The send state of a conversation (null for a new one). The decision is the runner's `turnBlockReason`. The
 * selectors below subscribe to what that decision reads, so the hook re-reads it when any of them changes. The
 * runner's own turn and queue are module state, so every change to them is also a store write that the selectors see.
 */
export function useTurnAvailability(taskId: string | null): TurnAvailability {
  const runningTaskId = useDispatchStore((s) => s.runningTaskId);
  const sessionId = useDispatchStore((s) => s.tasks.find((task) => task.id === taskId)?.sessionId);
  useDispatchStore((s) => s.tasks.find((task) => task.id === taskId)?.status);
  useChatStore((s) => s.isStreaming || s.compacting);
  useChatStore((s) => s.sessions.find((session) => session.id === sessionId)?.modelId);
  useModelStore((s) => s.serverStatus.running);
  useModelStore((s) => s.activeModelId);
  return {
    blocker: turnBlockReason(taskId),
    queuedNote: queuedNoteFor(runningTaskId, taskId),
  };
}
