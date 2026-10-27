import { create } from "zustand";
import type {
  ActiveStream,
  ChatSession,
  ChatSettingsOverrides,
  Message,
  ReplyUsage,
} from "../types";

/** Max characters used for auto-generated session titles from the first message. */
const AUTO_TITLE_MAX_LENGTH = 50;

/** Calculate total characters across all messages in a session. */
function calcContextChars(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + m.content.length, 0);
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isStreaming: boolean;
  /** Stream in flight. Events are matched by its id and written to its session. */
  activeStream: ActiveStream | null;
  retryFromMessageId: string | null;
  /** Timestamp when the last send was triggered — used for generation stats. */
  lastSendTime: number;

  createSession: (modelId?: string) => string;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, message: Message) => void;
  updateLastAssistantMessage: (sessionId: string, content: string) => void;
  updateMessageStats: (sessionId: string, messageId: string, stats: Message["stats"]) => void;
  updateMessageUsage: (sessionId: string, messageId: string, usage: ReplyUsage) => void;
  updateMessageFinishReason: (sessionId: string, messageId: string, finishReason: string) => void;
  /** Removes the message and every message after it. */
  removeMessagesFrom: (sessionId: string, messageId: string) => void;
  removeMessagesAfter: (sessionId: string, messageId: string) => void;
  setStreaming: (streaming: boolean) => void;
  setActiveStream: (stream: ActiveStream | null) => void;
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
  retryFromMessageId: null,
  lastSendTime: 0,

  createSession: (modelId?: string) => {
    // One empty draft at a time: a new conversation opens the existing empty one.
    const draft = get().sessions.find((s) => s.messages.length === 0);
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
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: id,
    }));
    return id;
  },

  deleteSession: (id: string) => {
    set((state) => {
      const filtered = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: filtered,
        activeSessionId:
          state.activeSessionId === id ? (filtered[0]?.id ?? null) : state.activeSessionId,
      };
    });
  },

  setActiveSession: (id: string | null) => {
    set({ activeSessionId: id });
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
        if (last && last.role === "assistant") {
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

  removeMessagesFrom: (sessionId: string, messageId: string) => {
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const idx = s.messages.findIndex((m) => m.id === messageId);
        if (idx < 0) return s;
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
        if (idx < 0) return s;
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
    set((state) => ({
      sessions: state.sessions.filter((s) => s.messages.length > 0 || s.id === keepId),
    }));
  },
}));
