import { useRef } from "react";
import { useTauriEvent } from "../../../hooks";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import type { GenerationStats, Message } from "../../../types";

/** Text received for one stream and not yet written to the chat. */
interface PendingText {
  streamId: string;
  text: string;
}

/**
 * Applies `chat-chunk` and `chat-done` events to the session that started the stream. Stream
 * events are matched by id, so tokens still land in the right session if the user switched chats.
 * Stream state (`isStreaming`, `activeStream`) lives in the chat store; components read it from there.
 *
 * Chunks are buffered and written once per animation frame. Writing every token re-rendered the
 * whole thread per token, so the webview fell behind the stream and a stop or finish showed late.
 */
export function useChatStream() {
  // Per-response counters for generation stats.
  const tokenCountRef = useRef(0);
  const firstTokenTimeRef = useRef(0);
  const responseStreamRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingText | null>(null);
  const frameRef = useRef<number | null>(null);

  /** Writes the buffered text into the stream's message now. */
  const flush = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending?.text) return;

    const store = useChatStore.getState();
    const stream = store.activeStream;
    if (!stream || stream.streamId !== pending.streamId) return;
    const activeId = stream.sessionId;
    const session = store.sessions.find((s) => s.id === activeId);
    if (!session) return;

    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      store.updateLastAssistantMessage(activeId, lastMsg.content + pending.text);
      return;
    }

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: pending.text,
      timestamp: Date.now(),
      modelId: session.modelId ?? undefined,
      compute: stream.compute,
    };
    store.addMessage(activeId, assistantMsg);
    // Persist immediately so the message survives app restarts mid-stream.
    db.saveMessage(activeId, assistantMsg).catch(() => undefined);
  };

  useTauriEvent<{ streamId: string; content: string }>("chat-chunk", (payload) => {
    const stream = useChatStore.getState().activeStream;
    if (!stream || stream.streamId !== payload.streamId) return;

    // First chunk of a new response: reset per-response counters.
    if (responseStreamRef.current !== payload.streamId) {
      responseStreamRef.current = payload.streamId;
      tokenCountRef.current = 0;
      firstTokenTimeRef.current = Date.now();
    }
    tokenCountRef.current += 1;

    if (pendingRef.current?.streamId !== payload.streamId) {
      flush();
      pendingRef.current = { streamId: payload.streamId, text: "" };
    }
    pendingRef.current.text += payload.content;
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
  });

  useTauriEvent<{
    streamId: string;
    finishReason: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
  }>("chat-done", (payload) => {
    // Write everything received so far, so the final message holds the whole reply.
    flush();

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
    responseStreamRef.current = null;

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

    // The server's exact counts for this reply, when it reported them.
    const usage =
      payload.promptTokens !== null && payload.completionTokens !== null
        ? { promptTokens: payload.promptTokens, completionTokens: payload.completionTokens }
        : undefined;
    if (lastMsg.role === "assistant" && usage) {
      store.updateMessageUsage(activeId, lastMsg.id, usage);
    }

    if (lastMsg.role === "assistant" && lastMsg.content) {
      const stats: GenerationStats = { timeToFirstToken, totalTime, tokenCount, promptChars };
      store.updateMessageStats(activeId, lastMsg.id, stats);
      // `lastMsg` was read before the finish reason and stats were set, so build the saved copy
      // after both are known. Saving the stale copy would drop them from the database.
      const finalMsg: Message = {
        ...lastMsg,
        ...(payload.finishReason ? { finishReason: payload.finishReason } : {}),
        ...(usage ? { usage } : {}),
        stats,
      };
      db.saveMessage(activeId, finalMsg).catch(() => undefined);
    }
  });
}
