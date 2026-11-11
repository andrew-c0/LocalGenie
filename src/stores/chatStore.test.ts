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
