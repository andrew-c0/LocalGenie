import { useChatStore } from "../stores/chatStore";
import type { Message } from "../types";

/** A stable empty list, so a session with no messages does not re-render its readers on every store change. */
const NO_MESSAGES: Message[] = [];

/** The messages of one session in the chat store, updated as they change. Empty for an unknown session. */
export function useSessionMessages(sessionId: string): Message[] {
  return useChatStore(
    (s) => s.sessions.find((session) => session.id === sessionId)?.messages ?? NO_MESSAGES,
  );
}
