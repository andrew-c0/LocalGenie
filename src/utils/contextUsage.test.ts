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

  it("estimates everything when no reply reported its counts", () => {
    const usage = contextUsageOf([message(undefined)]);
    expect(usage).toEqual({ total: 1, fileTokens: 0, exact: false });
  });

  it("starts from the last reply's exact counts and estimates what came after", () => {
    const messages = [
      message(undefined),
      reply("r1", { promptTokens: 1000, completionTokens: 50 }),
      { id: "u2", role: "user" as const, content: "x".repeat(400), timestamp: 3 },
    ];
    // 1000 prompt + 50 reply exact, then 400 characters at four per token.
    expect(contextUsageOf(messages)).toEqual({ total: 1150, fileTokens: 0, exact: true });
  });

  it("uses the latest reply that has counts, not an earlier one", () => {
    const messages = [
      reply("r1", { promptTokens: 100, completionTokens: 10 }),
      reply("r2", { promptTokens: 300, completionTokens: 20 }),
    ];
    expect(contextUsageOf(messages).total).toBe(320);
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

    it("ignores counts from replies before the summary and estimates the summary text", () => {
      const messages = [
        message(undefined),
        reply("r1", { promptTokens: 9000, completionTokens: 500 }),
        summary("x".repeat(400)),
        { id: "u2", role: "user" as const, content: "y".repeat(40), timestamp: 3 },
      ];
      // 400 + 40 characters at four per token, with no exact count after the summary.
      expect(contextUsageOf(messages)).toEqual({ total: 110, fileTokens: 0, exact: false });
    });

    it("starts from a reply after the summary when it reported its counts", () => {
      const messages = [
        reply("r1", { promptTokens: 9000, completionTokens: 500 }),
        summary("x".repeat(400)),
        reply("r2", { promptTokens: 300, completionTokens: 20 }),
        { id: "u3", role: "user" as const, content: "y".repeat(80), timestamp: 4 },
      ];
      // The summary is inside the exact count of r2; only the new message is estimated.
      expect(contextUsageOf(messages)).toEqual({ total: 340, fileTokens: 0, exact: true });
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
        { id: "u2", role: "user" as const, content: "y".repeat(40), timestamp: 3 },
      ];
      expect(contextUsageOf(messages)).toEqual({ total: 20, fileTokens: 0, exact: false });
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
