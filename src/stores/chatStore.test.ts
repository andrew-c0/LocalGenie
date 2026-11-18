import { beforeEach, describe, expect, it } from "vitest";
import type { ChatSession, Message } from "../types";
import { messagesOf, useChatStore } from "./chatStore";

function msg(id: string, role: Message["role"] = "user"): Message {
  return { id, role, content: id, timestamp: 1 };
}

function summaryRow(id: string, coversThroughId: string | null): Message {
  return {
    id,
    role: "system",
    kind: "system",
    systemType: "summary",
    content: "summary",
    timestamp: 1,
    coversThroughId,
  };
}

function sessionWith(messages: Message[]): ChatSession {
  return {
    id: "chat",
    title: "Chat",
    messages,
    contextChars: 0,
    createdAt: 1,
    updatedAt: 1,
    pinned: false,
  };
}

/** A conversation whose first two messages are covered by a summary row. */
function summarisedChat(): Message[] {
  return [msg("a"), msg("b", "assistant"), summaryRow("s", "b"), msg("c"), msg("d", "assistant")];
}

function idsOf(sessionId: string): string[] {
  return messagesOf(sessionId).map((m) => m.id);
}

beforeEach(() => {
  useChatStore.setState({
    sessions: [sessionWith(summarisedChat())],
    compacting: false,
    compactionJobId: null,
  });
});

describe("removeMessagesFrom", () => {
  it("removes a message after the summary and every message after it", () => {
    useChatStore.getState().removeMessagesFrom("chat", "c");
    expect(idsOf("chat")).toEqual(["a", "b", "s"]);
  });

  it("refuses a covered message, so nothing is removed", () => {
    useChatStore.getState().removeMessagesFrom("chat", "a");
    expect(idsOf("chat")).toEqual(["a", "b", "s", "c", "d"]);
  });

  it("refuses a summary row, so nothing is removed", () => {
    useChatStore.getState().removeMessagesFrom("chat", "s");
    expect(idsOf("chat")).toEqual(["a", "b", "s", "c", "d"]);
  });
});

describe("removeMessagesAfter", () => {
  it("keeps the message and removes the ones after it", () => {
    useChatStore.getState().removeMessagesAfter("chat", "c");
    expect(idsOf("chat")).toEqual(["a", "b", "s", "c"]);
  });

  it("refuses when the range after the message holds a summary row", () => {
    const chat = [msg("a"), summaryRow("s1", "a"), msg("b"), summaryRow("s2", null), msg("c")];
    useChatStore.setState({ sessions: [sessionWith(chat)] });
    useChatStore.getState().removeMessagesAfter("chat", "b");
    expect(idsOf("chat")).toEqual(["a", "s1", "b", "s2", "c"]);
  });
});

describe("setCompacting", () => {
  it("marks a summary as running under its job, and clears the mark", () => {
    useChatStore.getState().setCompacting("job-1");
    expect(useChatStore.getState().compacting).toBe(true);
    expect(useChatStore.getState().compactionJobId).toBe("job-1");

    useChatStore.getState().setCompacting(null);
    expect(useChatStore.getState().compacting).toBe(false);
    expect(useChatStore.getState().compactionJobId).toBeNull();
  });

  it("records the session the summary belongs to, and forgets it when the mark clears", () => {
    useChatStore.getState().setCompacting("job-2", "chat");
    expect(useChatStore.getState().compactingSessionId).toBe("chat");

    useChatStore.getState().setCompacting(null);
    expect(useChatStore.getState().compactingSessionId).toBeNull();
  });
});

describe("setToolRunSessionId", () => {
  it("names the chat whose tool run is in progress, and clears it with null", () => {
    useChatStore.getState().setToolRunSessionId("chat");
    expect(useChatStore.getState().toolRunSessionId).toBe("chat");

    useChatStore.getState().setToolRunSessionId(null);
    expect(useChatStore.getState().toolRunSessionId).toBeNull();
  });
});

describe("updateMessageToolCalls", () => {
  it("sets the calls of the given reply and leaves the other messages alone", () => {
    useChatStore.setState({ sessions: [sessionWith([msg("u", "user"), msg("r", "assistant")])] });
    const calls = [{ id: "c1", name: "list_directory", arguments: "{}" }];

    useChatStore.getState().updateMessageToolCalls("chat", "r", calls);

    const messages = messagesOf("chat");
    expect(messages[1].toolCalls).toEqual(calls);
    expect(messages[0].toolCalls).toBeUndefined();
    expect(messages[1].content).toBe("r");
  });
});

describe("Dispatch sessions", () => {
  function taskSession(id: string): ChatSession {
    return { ...sessionWith([]), id, kind: "dispatch" };
  }

  it("does not reuse an empty Dispatch session as the new-chat draft", () => {
    useChatStore.setState({ sessions: [taskSession("task")], activeSessionId: null });
    const id = useChatStore.getState().createSession();
    expect(id).not.toBe("task");
    expect(useChatStore.getState().sessions.map((s) => s.id)).toContain("task");
  });

  it("keeps an empty Dispatch session when the empty drafts are discarded", () => {
    const draft = { ...sessionWith([]), id: "draft" };
    useChatStore.setState({ sessions: [taskSession("task"), draft] });
    useChatStore.getState().discardEmptySessions(null);
    expect(useChatStore.getState().sessions.map((s) => s.id)).toEqual(["task"]);
  });

  it("falls back to a chat, not a Dispatch session, when the open chat is deleted", () => {
    useChatStore.setState({
      sessions: [taskSession("task"), sessionWith(summarisedChat())],
      activeSessionId: "chat",
    });
    useChatStore.getState().deleteSession("chat");
    expect(useChatStore.getState().activeSessionId).toBeNull();
  });

  it("adds a session once, and replaces it when the id is already there", () => {
    useChatStore.setState({ sessions: [] });
    useChatStore.getState().addSession(taskSession("task"));
    useChatStore.getState().addSession({ ...taskSession("task"), title: "Renamed" });
    const sessions = useChatStore.getState().sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe("Renamed");
  });
});
