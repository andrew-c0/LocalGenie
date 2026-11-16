import type { ChatSession, Message } from "../types";
import { isToolMessage } from "./toolRecords";

/**
 * The conversations a chat list shows: every session but a Dispatch task's. The new-chat draft, the
 * fallback when a chat is deleted and the chat route use these too, so a task is never opened as a chat.
 */
export function chatSessionsOf(sessions: readonly ChatSession[]): ChatSession[] {
  return sessions.filter((session) => session.kind !== "dispatch");
}

/**
 * Pinned conversations first, then the most recently updated first inside each group. The sort is
 * stable, so conversations updated at the same time keep the store's order. Returns a new array; the
 * store's own list is not changed.
 */
export function pinnedFirst(sessions: readonly ChatSession[]): ChatSession[] {
  return [...sessions].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );
}

/**
 * `1 message` or `12 messages`. System lines (model changes, summaries) and tool results are not chat
 * messages, so they are not counted.
 */
export function messageCountLabel(messages: readonly Message[]): string {
  const count = messages.filter(
    (message) => message.kind !== "system" && !isToolMessage(message),
  ).length;
  return `${count} message${count === 1 ? "" : "s"}`;
}
