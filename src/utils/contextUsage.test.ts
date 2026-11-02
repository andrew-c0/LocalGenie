import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { contextUsageOf, fileTokensOf } from "./contextUsage";

function message(attachments: Message["attachments"]): Message {
  return { id: "m", role: "user", content: "hi", timestamp: 1, attachments };
}

describe("fileTokensOf", () => {
  it("is zero when no message has a text file", () => {
    expect(fileTokensOf([message(undefined)])).toBe(0);
    expect(fileTokensOf([message([{ id: "a", kind: "image", name: "a.png", size: 400 }])])).toBe(0);
  });

  it("adds the characters of every text file, at four per token", () => {
    const messages = [
      message([{ id: "a", kind: "text", name: "a.md", size: 100, chars: 400 }]),
      message([{ id: "b", kind: "text", name: "b.md", size: 40, chars: 120 }]),
    ];
    expect(fileTokensOf(messages)).toBe(130);
  });

  it("falls back to the file size for refs saved without a char count", () => {
    const messages = [message([{ id: "a", kind: "text", name: "a.md", size: 200 }])];
    expect(fileTokensOf(messages)).toBe(50);
  });
});

describe("contextUsageOf", () => {
  const reply = (id: string, usage?: Message["usage"], content = "answer"): Message => ({
    id,
    role: "assistant",
    content,
    timestamp: 2,
    usage,
  });
  const user = (id: string, chars: number): Message => ({
    id,
    role: "user",
    content: "x".repeat(chars),
    timestamp: 1,
  });

  it("estimates everything when no reply reported its counts", () => {
    expect(contextUsageOf([message(undefined)])).toEqual({ total: 1, fileTokens: 0 });
  });

  it("counts a reply by its completion tokens and a prompt by its text", () => {
    const messages = [user("u1", 400), reply("r1", { promptTokens: 100, completionTokens: 50 })];
    // 400 characters at four per token, plus the reply's 50. The prompt count is not added.
    expect(contextUsageOf(messages).total).toBe(150);
  });

  it("adds every message, not just the last reply (the server prompt count covers new tokens only)", () => {
    const messages = [
      user("u1", 400),
      reply("r1", { promptTokens: 100, completionTokens: 300 }),
      user("u2", 40),
      reply("r2", { promptTokens: 20, completionTokens: 300 }),
    ];
    expect(contextUsageOf(messages).total).toBe(100 + 300 + 10 + 300);
  });

  it("estimates a reply that has no counts from its text", () => {
    expect(contextUsageOf([reply("r1", undefined, "y".repeat(80))]).total).toBe(20);
  });

  describe("with a summary", () => {
    const summary = (content: string): Message => ({
      id: "s",
      role: "system",
      kind: "system",
      systemType: "summary",
      content,
      timestamp: 1,
      coversThroughId: "r1",
    });

    it("leaves out the messages before the summary and counts the summary text", () => {
      const messages = [
        message(undefined),
        reply("r1", { promptTokens: 9000, completionTokens: 500 }),
        summary("x".repeat(400)),
        user("u2", 40),
      ];
      // 400 + 40 characters at four per token.
      expect(contextUsageOf(messages)).toEqual({ total: 110, fileTokens: 0 });
    });

    it("adds replies after the summary by their completion tokens", () => {
      const messages = [
        reply("r1", { promptTokens: 9000, completionTokens: 500 }),
        summary("x".repeat(400)),
        user("u2", 40),
        reply("r2", { promptTokens: 300, completionTokens: 20 }),
      ];
      expect(contextUsageOf(messages).total).toBe(100 + 10 + 20);
    });

    it("does not count files sent before the summary", () => {
      const messages = [
        {
          id: "u1",
          role: "user" as const,
          content: "",
          timestamp: 1,
          attachments: [{ id: "a", kind: "text" as const, name: "a.md", size: 4000, chars: 4000 }],
        },
        summary("x".repeat(40)),
        user("u2", 40),
      ];
      expect(contextUsageOf(messages)).toEqual({ total: 20, fileTokens: 0 });
    });
  });

  it("caps the file share at the total", () => {
    const messages = [
      {
        id: "u1",
        role: "user" as const,
        content: "",
        timestamp: 1,
        attachments: [{ id: "a", kind: "text" as const, name: "a.md", size: 4000, chars: 4000 }],
      },
    ];
    const usage = contextUsageOf(messages);
    expect(usage.fileTokens).toBe(usage.total);
  });
});
