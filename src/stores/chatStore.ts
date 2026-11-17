import { create } from "zustand";
import type {
  ActiveStream,
  ChatSession,
  ChatSettingsOverrides,
  ChatToolCall,
  Message,
  ReplyUsage,
  SessionKind,
} from "../types";
import { canRemoveFrom } from "../utils/compaction";
import { chatSessionsOf } from "../utils/conversations";
import { isReplyMessage } from "../utils/toolRecords";

/** Max characters used for auto-generated session titles from the first message. */
const AUTO_TITLE_MAX_LENGTH = 50;

/** Calculate total characters across all messages in a session. */
function calcContextChars(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}

/** The messages of a conversation, or none when it is not in the store. */
export function messagesOf(sessionId: string): Message[] {
  return useChatStore.getState().sessions.find((s) => s.id === sessionId)?.messages ?? [];
}

/** What a session is: a conversation (`chat`) or a Dispatch session. A session not in the store is a chat. */
export function kindOf(sessionId: string): SessionKind {
  return useChatStore.getState().sessions.find((s) => s.id === sessionId)?.kind ?? "chat";
}

/** The settings a conversation overrides, or undefined when it overrides none. */
export function overridesOf(sessionId: string): ChatSettingsOverrides | undefined {
  return useChatStore.getState().sessions.find((s) => s.id === sessionId)?.settingsOverrides;
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isStreaming: boolean;
  /** Stream in flight. Events are matched by its id and written to its session. */
  activeStream: ActiveStream | null;
  /** True while the conversation is summarised before a send. The input waits and stop cancels it. */
  compacting: boolean;
  /** Job of the running summary, for cancelling it. Null when none runs. */
  compactionJobId: string | null;
  retryFromMessageId: string | null;
  /** Timestamp when the last send was triggered — used for generation stats. */
  lastSendTime: number;

  createSession: (modelId?: string) => string;
  /** Adds a session, or replaces the one with its id. Used for a Dispatch task's session when it is created. */
  addSession: (session: ChatSession) => void;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, message: Message) => void;
  /** Inserts a message just before the message with `beforeId`. Does nothing when that message is not there. */
  insertMessageBefore: (sessionId: string, beforeId: string, message: Message) => void;
  updateLastAssistantMessage: (sessionId: string, content: string) => void;
  updateMessageStats: (sessionId: string, messageId: string, stats: Message["stats"]) => void;
  updateMessageUsage: (sessionId: string, messageId: string, usage: ReplyUsage) => void;
  updateMessageFinishReason: (sessionId: string, messageId: string, finishReason: string) => void;
  /** Sets the tool calls an assistant reply made. Replaces any calls it had. */
  updateMessageToolCalls: (sessionId: string, messageId: string, toolCalls: ChatToolCall[]) => void;
  /** Removes the message and every message after it. */
  removeMessagesFrom: (sessionId: string, messageId: string) => void;
  removeMessagesAfter: (sessionId: string, messageId: string) => void;
  setStreaming: (streaming: boolean) => void;
  setActiveStream: (stream: ActiveStream | null) => void;
  /** Marks a summary as running under `jobId`, or clears the mark with null. */
  setCompacting: (jobId: string | null) => void;
  setRetryFromMessageId: (id: string | null) => void;
  setLastSendTime: (time: number) => void;
  loadSessions: (sessions: ChatSession[]) => void;
  setSessionModel: (sessionId: string, modelId: string) => void;
  /** Pins or unpins a conversation. Leaves updatedAt alone so the list order by recency holds. */
  setSessionPinned: (sessionId: string, pinned: boolean) => void;
  /** Sets the settings a chat overrides, or clears them with undefined. Saved like a pin change. */
  setSessionOverrides: (sessionId: string, overrides: ChatSettingsOverrides | undefined) => void;
  /** Renames a conversation. Auto-titling only replaces "New Chat", so a rename is kept. */
  renameSession: (sessionId: string, title: string) => void;
  /** Drops empty conversations (no messages yet), except `keepId`. Nothing is stored for them. */
  discardEmptySessions: (keepId: string | null) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isStreaming: false,
  activeStream: null,
  compacting: false,
  compactionJobId: null,
  retryFromMessageId: null,
  lastSendTime: 0,

  createSession: (modelId?: string) => {
    // One empty draft at a time: a new conversation opens the existing empty one.
    const draft = chatSessionsOf(get().sessions).find((s) => s.messages.length === 0);
    if (draft) return draft.id;

    const id = crypto.randomUUID();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: "New Chat",
      messages: [],
      modelId,
      contextChars: 0,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      kind: "chat",
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: id,
    }));
    return id;
  },

  addSession: (session: ChatSession) => {
    set((state) => ({
      sessions: state.sessions.some((s) => s.id === session.id)
        ? state.sessions.map((s) => (s.id === session.id ? session : s))
        : [session, ...state.sessions],
    }));
  },

  deleteSession: (id: string) => {
    set((state) => {
      const filtered = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: filtered,
        activeSessionId:
          state.activeSessionId === id
            ? (chatSessionsOf(filtered)[0]?.id ?? null)
            : state.activeSessionId,
      };
    });
  },

  setActiveSession: (id: string | null) => {
    set({ activeSessionId: id });
  },

  insertMessageBefore: (sessionId: string, beforeId: string, message: Message) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const index = s.messages.findIndex((m) => m.id === beforeId);
        if (index < 0) return s;
        return {
          ...s,
          messages: [...s.messages.slice(0, index), message, ...s.messages.slice(index)],
        };
      }),
    }));
  },

  addMessage: (sessionId: string, message: Message) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const newMessages = [...s.messages, message];
        return {
          ...s,
          messages: newMessages,
          contextChars: calcContextChars(newMessages),
          updatedAt: Date.now(),
          // Auto-title from first user message
          title:
            s.title === "New Chat" && message.role === "user"
              ? message.content.slice(0, AUTO_TITLE_MAX_LENGTH) +
                (message.content.length > AUTO_TITLE_MAX_LENGTH ? "..." : "")
              : s.title,
        };
      }),
    }));
  },

  updateLastAssistantMessage: (sessionId: string, content: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const msgs = [...s.messages];
        const last = msgs[msgs.length - 1];
        // Only the last message, and only when it is a reply: a trailing tool row is never overwritten.
        if (last && isReplyMessage(last)) {
          msgs[msgs.length - 1] = { ...last, content };
        }
        return {
          ...s,
          messages: msgs,
          contextChars: calcContextChars(msgs),
          updatedAt: Date.now(),
        };
      }),
    }));
  },

  updateMessageStats: (sessionId: string, messageId: string, stats: Message["stats"]) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) => (m.id === messageId ? { ...m, stats } : m)),
        };
      }),
    }));
  },

  updateMessageUsage: (sessionId: string, messageId: string, usage: ReplyUsage) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) => (m.id === messageId ? { ...m, usage } : m)),
        };
      }),
    }));
  },

  updateMessageFinishReason: (sessionId: string, messageId: string, finishReason: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) => (m.id === messageId ? { ...m, finishReason } : m)),
        };
      }),
    }));
  },

  updateMessageToolCalls: (sessionId: string, messageId: string, toolCalls: ChatToolCall[]) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) => (m.id === messageId ? { ...m, toolCalls } : m)),
        };
      }),
    }));
  },

  removeMessagesFrom: (sessionId: string, messageId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const idx = s.messages.findIndex((m) => m.id === messageId);
        // A covered message or a summary row is never removed, so the store refuses the whole range.
        if (idx < 0 || !canRemoveFrom(s.messages, idx)) return s;
        const kept = s.messages.slice(0, idx);
        return {
          ...s,
          messages: kept,
          contextChars: calcContextChars(kept),
          updatedAt: Date.now(),
        };
      }),
    }));
  },

  removeMessagesAfter: (sessionId: string, messageId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const idx = s.messages.findIndex((m) => m.id === messageId);
        // Removes the messages after `messageId`, so the same guard applies to the range it removes.
        if (idx < 0 || !canRemoveFrom(s.messages, idx)) return s;
        const trimmed = s.messages.slice(0, idx + 1);
        return {
          ...s,
          messages: trimmed,
          contextChars: calcContextChars(trimmed),
          updatedAt: Date.now(),
        };
      }),
    }));
  },

  setActiveStream: (stream: ActiveStream | null) => {
    set({ activeStream: stream });
  },

  setStreaming: (streaming: boolean) => {
    set({ isStreaming: streaming });
  },

  setRetryFromMessageId: (id: string | null) => {
    set({ retryFromMessageId: id });
  },

  setCompacting: (jobId: string | null) => {
    set({ compacting: jobId !== null, compactionJobId: jobId });
  },

  setLastSendTime: (time: number) => {
    set({ lastSendTime: time });
  },

  loadSessions: (sessions: ChatSession[]) => {
    // The URL decides which chat is open, so loading sessions does not pick one.
    set({ sessions });
  },

  setSessionModel: (sessionId: string, modelId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, modelId, updatedAt: Date.now() } : s,
      ),
    }));
  },

  setSessionPinned: (sessionId: string, pinned: boolean) => {
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, pinned } : s)),
    }));
  },

  setSessionOverrides: (sessionId: string, overrides: ChatSettingsOverrides | undefined) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, settingsOverrides: overrides } : s,
      ),
    }));
  },

  renameSession: (sessionId: string, title: string) => {
    const next = title.trim();
    if (!next) return;
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, title: next } : s)),
    }));
  },

  discardEmptySessions: (keepId: string | null) => {
    // A Dispatch task's session stays even while it is empty: the task is stored without messages until it starts.
    set((state) => ({
      sessions: state.sessions.filter(
        (s) => s.kind === "dispatch" || s.messages.length > 0 || s.id === keepId,
      ),
    }));
  },
}));
