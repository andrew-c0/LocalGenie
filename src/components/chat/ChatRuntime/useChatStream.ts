import { useRef } from "react";
import { useTauriEvent } from "../../../hooks";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import type { GenerationStats, Message } from "../../../types";

/**
 * Applies `chat-chunk` and `chat-done` events to the session that started the stream. Stream
 * events are matched by id, so tokens still land in the right session if the user switched chats.
 * Stream state (`isStreaming`, `activeStream`) lives in the chat store; components read it from there.
 */
export function useChatStream() {
  // Per-response counters for generation stats.
  const tokenCountRef = useRef(0);
  const firstTokenTimeRef = useRef(0);

  useTauriEvent<{ streamId: string; content: string }>("chat-chunk", (payload) => {
    const store = useChatStore.getState();
    const stream = store.activeStream;
    if (!stream || stream.streamId !== payload.streamId) return;
    const activeId = stream.sessionId;
    const session = store.sessions.find((s) => s.id === activeId);
    if (!session) return;

    tokenCountRef.current += 1;

    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      store.updateLastAssistantMessage(activeId, lastMsg.content + payload.content);
      return;
    }

    // First chunk of a new response: reset per-response counters.
    tokenCountRef.current = 1;
    firstTokenTimeRef.current = Date.now();
    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: payload.content,
      timestamp: Date.now(),
      modelId: session.modelId ?? undefined,
    };
    store.addMessage(activeId, assistantMsg);
    // Persist immediately so the message survives app restarts mid-stream.
    db.saveMessage(activeId, assistantMsg).catch(() => undefined);
  });

  useTauriEvent<{ streamId: string; finishReason: string | null }>("chat-done", (payload) => {
    const store = useChatStore.getState();
    const stream = store.activeStream;
    if (!stream || stream.streamId !== payload.streamId) return;
    store.setStreaming(false);
    store.setActiveStream(null);

    const activeId = stream.sessionId;
    const session = store.sessions.find((s) => s.id === activeId);
    if (!session) return;

    const lastMsg = session.messages[session.messages.length - 1];
    if (!lastMsg) return;

    // Stats for this response. The prompt is the user message that triggered it.
    const totalTime = Date.now() - store.lastSendTime;
    const timeToFirstToken = firstTokenTimeRef.current
      ? firstTokenTimeRef.current - store.lastSendTime
      : totalTime;
    const tokenCount = tokenCountRef.current;
    firstTokenTimeRef.current = 0;
    tokenCountRef.current = 0;

    let promptChars = 0;
    for (let i = session.messages.length - 2; i >= 0; i--) {
      if (session.messages[i].role === "user") {
        promptChars = session.messages[i].content.length;
        break;
      }
    }

    if (lastMsg.role === "assistant" && payload.finishReason) {
      store.updateMessageFinishReason(activeId, lastMsg.id, payload.finishReason);
    }

    if (lastMsg.role === "assistant" && lastMsg.content) {
      const stats: GenerationStats = { timeToFirstToken, totalTime, tokenCount, promptChars };
      store.updateMessageStats(activeId, lastMsg.id, stats);
      // `lastMsg` was read before the finish reason and stats were set, so build the saved copy
      // after both are known. Saving the stale copy would drop them from the database.
      const finalMsg: Message = {
        ...lastMsg,
        ...(payload.finishReason ? { finishReason: payload.finishReason } : {}),
        stats,
      };
      db.saveMessage(activeId, finalMsg).catch(() => undefined);
    }
  });
}
