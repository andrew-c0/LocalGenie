import { useNavigate } from "react-router-dom";
import * as db from "../services/database";
import { useChatStore } from "../stores/chatStore";
import type { ChatSession } from "../types";

/**
 * Rename, pin and delete for a conversation, shared by the context header and the conversation list.
 * Rename and pin change the store only: `useSessionPersistence` saves the changed session. Delete
 * also removes the stored copy, and leaves the chat when the deleted conversation is the open one.
 */
export function useSessionActions() {
  const navigate = useNavigate();
  const renameSession = useChatStore((s) => s.renameSession);
  const setSessionPinned = useChatStore((s) => s.setSessionPinned);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const rename = (sessionId: string, title: string) => {
    renameSession(sessionId, title);
  };

  const togglePin = (session: ChatSession) => {
    setSessionPinned(session.id, !session.pinned);
  };

  const remove = (sessionId: string) => {
    // Read before the store moves the active id on.
    const wasOpen = useChatStore.getState().activeSessionId === sessionId;
    deleteSession(sessionId);
    if (wasOpen) navigate("/chat");
    db.deleteSession(sessionId).catch(() => {});
  };

  return { rename, togglePin, remove };
}
