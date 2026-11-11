import { useRef } from "react";
import { useTauriEvent } from "../../../hooks";
import * as db from "../../../services/database";
import { CHAT_TOOL_CALLS_EVENT } from "../../../services/geniex";
import { useChatStore } from "../../../stores/chatStore";
import type {
  ActiveStream,
  ChatToolCall,
  ChatToolCallsEvent,
  GenerationStats,
  Message,
  ReplyUsage,
} from "../../../types";
import { replyWithToolCalls } from "../../../utils/replyToolCalls";
import { isReplyMessage } from "../../../utils/toolRecords";

/** Text received for one stream and not yet written to the chat. */
interface PendingText {
  streamId: string;
  text: string;
}

/** Tool calls a stream made, from `chat-tool-calls`. Kept until that stream's `chat-done`. */
interface PendingToolCalls {
  streamId: string;
  calls: ChatToolCall[];
}

interface ChatDonePayload {
  streamId: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

/** Characters of the user message that triggered the reply: the last user message before the final one. */
function promptCharsBefore(messages: Message[]): number {
  for (let i = messages.length - 2; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content.length;
  }
  return 0;
}

/** The server's exact token counts for a reply, when it reported both. */
function usageOf(payload: ChatDonePayload): ReplyUsage | undefined {
  if (payload.promptTokens === null || payload.completionTokens === null) return undefined;
  return { promptTokens: payload.promptTokens, completionTokens: payload.completionTokens };
}

/**
 * Puts a stream's tool calls on its reply: the reply it wrote, or a new empty reply when it wrote no
 * text. The reply is stored with its calls by the `chat-done` handler's save.
 */
function attachToolCalls(sessionId: string, stream: ActiveStream, calls: ChatToolCall[]): void {
  const store = useChatStore.getState();
  const session = store.sessions.find((s) => s.id === sessionId);
  const messages = session?.messages ?? [];
  const last = messages[messages.length - 1];
  const fresh: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    modelId: session?.modelId ?? undefined,
    compute: stream.compute,
  };
  const { message, isNew } = replyWithToolCalls(last, calls, fresh);
  if (isNew) store.addMessage(sessionId, message);
  else store.updateMessageToolCalls(sessionId, message.id, calls);
}

/**
 * Applies `chat-chunk`, `chat-tool-calls` and `chat-done` events to the session that started the stream.
 * Stream events are matched by id, so tokens still land in the right session if the user switched chats.
 * Stream state (`isStreaming`, `activeStream`) lives in the chat store; components read it from there.
 *
 * Chunks are buffered and written once per animation frame. Writing every token re-rendered the
 * whole thread per token, so the webview fell behind the stream and a stop or finish showed late.
 *
 * A stream that made tool calls keeps `isStreaming` at its `chat-done`: the tool loop
 * (`services/toolLoop.ts`) owns that flag and clears it when the whole run ends.
 */
export function useChatStream() {
  // Per-response counters for generation stats.
  const tokenCountRef = useRef(0);
  const firstTokenTimeRef = useRef(0);
  const responseStreamRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingText | null>(null);
  const frameRef = useRef<number | null>(null);
  const toolCallsRef = useRef<PendingToolCalls | null>(null);

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

    // A tool row or an error after the reply means the next text is a new reply, not more of this one.
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg && isReplyMessage(lastMsg)) {
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

  /** The calls of a stream, once. Null when the stream made none. */
  const takeToolCalls = (streamId: string): ChatToolCall[] | null => {
    const pending = toolCallsRef.current;
    if (pending?.streamId !== streamId || pending.calls.length === 0) return null;
    toolCallsRef.current = null;
    return pending.calls;
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

  useTauriEvent<ChatToolCallsEvent>(CHAT_TOOL_CALLS_EVENT, (payload) => {
    const stream = useChatStore.getState().activeStream;
    if (!stream || stream.streamId !== payload.streamId) return;
    toolCallsRef.current = { streamId: payload.streamId, calls: payload.toolCalls };
  });

  useTauriEvent<ChatDonePayload>("chat-done", (payload) => {
    // Write everything received so far, so the final message holds the whole reply.
    flush();
    const calls = takeToolCalls(payload.streamId);

    const store = useChatStore.getState();
    const stream = store.activeStream;
    if (!stream || stream.streamId !== payload.streamId) return;
    if (!calls) store.setStreaming(false);
    store.setActiveStream(null);

    const activeId = stream.sessionId;
    if (calls) attachToolCalls(activeId, stream, calls);
    const session = useChatStore.getState().sessions.find((s) => s.id === activeId);
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

    const promptChars = promptCharsBefore(session.messages);

    // The finish is for the reply only. A tool row at the end (a reply that only made calls) has none.
    const reply = isReplyMessage(lastMsg);
    if (reply && payload.finishReason) {
      store.updateMessageFinishReason(activeId, lastMsg.id, payload.finishReason);
    }

    const usage = usageOf(payload);
    if (reply && usage) {
      store.updateMessageUsage(activeId, lastMsg.id, usage);
    }

    // A reply with no text but with calls is still stored, so its calls survive a reload.
    const hasCalls = (lastMsg.toolCalls?.length ?? 0) > 0;
    if (reply && (lastMsg.content || hasCalls)) {
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
