import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../stores/chatStore";
import { useDispatchStore } from "../stores/dispatchStore";
import { useModelStore } from "../stores/modelStore";
import type { DispatchTask } from "../types";
import {
  groupByModel,
  interruptedTasks,
  type ResumeGroup,
  shouldOfferResume,
} from "../utils/dispatchResume";

/** The interrupted conversations the resume dialog offers, grouped by the model they used. */
export interface ResumeOffer {
  groups: ResumeGroup[];
}

/**
 * Decides once per app start whether to offer the interrupted Dispatch conversations. The decision waits until
 * the conversation list, the startup reads and the CLI state are in, then reads the state once. A later change
 * does not bring the offer back. `dismiss` clears it when the user has answered.
 */
export function useDispatchResumeOffer(): { offer: ResumeOffer | null; dismiss: () => void } {
  const loaded = useDispatchStore((s) => s.loaded);
  const startupRead = useModelStore((s) => s.startupRead);
  const cliInstalled = useModelStore((s) => s.cliInstalled);
  const ready = loaded && startupRead && cliInstalled !== null;

  const [offer, setOffer] = useState<ResumeOffer | null>(null);
  const decided = useRef(false);

  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    setOffer(decideOffer());
  }, [ready]);

  return { offer, dismiss: () => setOffer(null) };
}

/** The offer as the stores are now, or null when the dialog is skipped this start. */
function decideOffer(): ResumeOffer | null {
  const tasks = interruptedTasks(useDispatchStore.getState().tasks);
  const models = useModelStore.getState();
  const chat = useChatStore.getState();
  const offerable = shouldOfferResume({
    candidates: tasks.length,
    cliInstalled: models.cliInstalled === true,
    busy: chat.isStreaming || chat.compacting || useDispatchStore.getState().runningTaskId !== null,
  });
  if (!offerable) return null;
  return { groups: groupByModel(tasks, modelOfSession) };
}

/** The model a conversation's session recorded, or null when it has none. */
function modelOfSession(task: DispatchTask): string | null {
  const session = useChatStore.getState().sessions.find((s) => s.id === task.sessionId);
  return session?.modelId ?? null;
}
