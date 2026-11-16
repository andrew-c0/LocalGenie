import { describe, expect, it } from "vitest";
import type { ChatSession, Message } from "../types";
import { fastestReplies } from "./generationSpeed";

function reply(id: string, modelId: string, tokenCount: number, totalTime: number): Message {
  return {
    id,
    role: "assistant",
    content: "answer",
    timestamp: 1,
    modelId,
    stats: { timeToFirstToken: 10, totalTime, tokenCount, promptChars: 5 },
  };
}

function session(id: string, kind: ChatSession["kind"], messages: Message[]): ChatSession {
  return {
    id,
    title: id,
    messages,
    contextChars: 0,
    createdAt: 0,
    updatedAt: 0,
    pinned: false,
    kind,
  };
}

describe("fastestReplies", () => {
  it("ranks the chat replies by tokens per second and keeps the top ones", () => {
    const sessions = [
      session("c1", "chat", [
        reply("a", "org/slow", 100, 10_000),
        reply("b", "org/fast", 300, 10_000),
      ]),
      session("c2", undefined, [reply("c", "org/mid", 200, 10_000)]),
    ];
    const top = fastestReplies(sessions, 2);
    expect(top.map((entry) => entry.model)).toEqual(["fast", "mid"]);
    expect(top[0].tps).toBeCloseTo(30);
  });

  it("does not count the messages of Dispatch conversations", () => {
    const sessions = [
      session("chat", "chat", [reply("a", "org/chat-model", 100, 10_000)]),
      session("dispatch", "dispatch", [reply("b", "org/dispatch-model", 999, 1000)]),
    ];
    const top = fastestReplies(sessions, 5);
    expect(top.map((entry) => entry.model)).toEqual(["chat-model"]);
  });

  it("skips replies with no time, no tokens, no model or no stats", () => {
    const noStats: Message = { id: "x", role: "assistant", content: "", timestamp: 1 };
    const sessions = [
      session("c", "chat", [
        reply("a", "org/zero-time", 10, 0),
        reply("b", "org/zero-tokens", 0, 500),
        noStats,
        { ...reply("d", "org/none", 10, 500), modelId: undefined },
      ]),
    ];
    expect(fastestReplies(sessions, 5)).toEqual([]);
  });
});
