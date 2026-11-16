import { useChatStore } from "../../stores/chatStore";
import { useDispatchStore } from "../../stores/dispatchStore";
import type { Message } from "../../types";
import { patchForEnd, type TurnEnd, taskWithEnd } from "../../utils/dispatchTask";
import { errorMessage } from "../../utils/errorMessage";
import { toast } from "../../utils/toast";
import * as db from "../database";
import { findTask, recordedModelOf } from "./state";

/** Adds a message to a conversation's session and stores it. A failed save is logged; the message stays in view. */
export function addMessage(sessionId: string, message: Message): void {
  useChatStore.getState().addMessage(sessionId, message);
  db.saveMessage(sessionId, message).catch((err: unknown) => {
    console.warn("[dispatch] Could not save a message:", err);
  });
}

/** A user message: the text as the user sent it. It has no approval, which only tool results carry. */
export function userMessage(content: string): Message {
  return { id: crypto.randomUUID(), role: "user", content, timestamp: Date.now() };
}

/**
 * Records the model a turn runs on in the conversation's session, so a later turn or a resume can load it
 * again. The session is saved with the chats; it changes only when the model does.
 */
export function recordModel(sessionId: string, modelId: string): void {
  if (recordedModelOf(sessionId) !== modelId) {
    useChatStore.getState().setSessionModel(sessionId, modelId);
  }
}

/**
 * Writes a conversation's end (status, answer or error, finish time). A failed save keeps the end in the store,
 * so the chat is not locked by a turn that is over.
 */
export async function recordEnd(taskId: string, end: TurnEnd): Promise<void> {
  const finishedAt = Date.now();
  try {
    await useDispatchStore.getState().update(taskId, patchForEnd(end, finishedAt));
  } catch (err) {
    toast.error("Could not save the conversation", errorMessage(err));
    const task = findTask(taskId);
    if (task) useDispatchStore.getState().applyTask(taskWithEnd(task, end, finishedAt));
  }
}
