import { describe, expect, it } from "vitest";
import type { ChatSession, Message } from "../types";
import { messageCountLabel, pinnedFirst } from "./conversations";

function session(id: string, pinned = false, updatedAt = 0): ChatSession {
  return {
    id,
    title: id,
    messages: [],
    contextChars: 0,
    createdAt: 0,
    updatedAt,
    pinned,
  };
}

function message(kind?: Message["kind"]): Message {
  return { id: `m-${Math.random()}`, role: "user", content: "hi", timestamp: 0, kind };
}

describe("pinnedFirst", () => {
  it("lists pinned conversations before the others", () => {
    const sessions = [session("a"), session("b", true), session("c"), session("d", true)];
    expect(pinnedFirst(sessions).map((s) => s.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("puts the most recently updated first inside each group", () => {
    const sessions = [
      session("old", false, 1),
      session("new", false, 3),
      session("pinned-old", true, 2),
      session("pinned-new", true, 4),
    ];
    expect(pinnedFirst(sessions).map((s) => s.id)).toEqual([
      "pinned-new",
      "pinned-old",
      "new",
      "old",
    ]);
  });

  it("keeps the store's order for conversations updated at the same time", () => {
    const sessions = [session("x"), session("y"), session("z", true)];
    expect(pinnedFirst(sessions).map((s) => s.id)).toEqual(["z", "x", "y"]);
  });

  it("does not change the list it is given", () => {
    const sessions = [session("a"), session("b", true)];
    pinnedFirst(sessions);
    expect(sessions.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("messageCountLabel", () => {
  it("uses the singular for one message", () => {
    expect(messageCountLabel([message()])).toBe("1 message");
  });

  it("uses the plural otherwise, and for none", () => {
    expect(messageCountLabel([message(), message()])).toBe("2 messages");
    expect(messageCountLabel([])).toBe("0 messages");
  });

  it("does not count system lines", () => {
    expect(messageCountLabel([message("text"), message("system"), message()])).toBe("2 messages");
  });

  it("does not count tool results", () => {
    const toolRow: Message = { ...message(), role: "tool", kind: "tool" };
    expect(messageCountLabel([message(), toolRow, message("tool")])).toBe("1 message");
  });
});
