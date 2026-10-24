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
