import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { effectiveCompaction } from "./compactionSettings";
import { compactionDue } from "./compactionTrigger";

/** A message of `chars` characters. At four characters per token, it is `chars / 4` tokens. */
function text(id: string, chars: number, extra: Partial<Message> = {}): Message {
  return { id, role: "user", content: "x".repeat(chars), timestamp: 1, ...extra };
}

const prompt = text("p", 40);

describe("compactionDue", () => {
  it("is false when the setting is off, whatever the usage", () => {
    expect(
      compactionDue({
        enabled: false,
        thresholdPercent: 70,
        messages: [text("a", 4000), prompt],
        prompt,
        windowTokens: 1000,
      }),
    ).toBe(false);
  });

  it("is false when the window is not known", () => {
    expect(
      compactionDue({
        enabled: true,
        thresholdPercent: 70,
        messages: [text("a", 4000), prompt],
        prompt,
        windowTokens: null,
      }),
    ).toBe(false);
  });

  it("is true when the history plus the prompt reaches the threshold share of the window", () => {
    // History 680 tokens + prompt 10 tokens = 690, which is 69% of 1000: not yet.
    // Add 40 more characters of history (10 tokens): 700, which is 70%: due.
    const base = { enabled: true, thresholdPercent: 70, prompt, windowTokens: 1000 };
    expect(compactionDue({ ...base, messages: [text("a", 2720), prompt] })).toBe(false);
    expect(compactionDue({ ...base, messages: [text("a", 2760), prompt] })).toBe(true);
  });

  it("does not count the prompt twice: usage is taken from the messages before it", () => {
    // Without the prompt, history is 690 tokens; the prompt adds 10 tokens. 700 of 1000 is due.
    expect(
      compactionDue({
        enabled: true,
        thresholdPercent: 70,
        messages: [text("a", 2760), prompt],
        prompt,
        windowTokens: 1000,
      }),
    ).toBe(true);
  });

  it("counts the summary and the messages after it, not the messages it replaces", () => {
    const summary: Message = {
      id: "s",
      role: "system",
      kind: "system",
      systemType: "summary",
      content: "y".repeat(400),
      timestamp: 1,
      coversThroughId: "a",
    };
    // The old 4000 characters are covered, so only the 400-character summary (100 tokens) counts.
    expect(
      compactionDue({
        enabled: true,
        thresholdPercent: 70,
        messages: [text("a", 4000), summary, prompt],
        prompt,
        windowTokens: 1000,
      }),
    ).toBe(false);
  });

  it("follows the chat's own switch and threshold, resolved from the app setting", () => {
    // History 700 tokens + prompt 10 tokens: 71% of 1000. Due at 70%, not at 75%.
    const messages = [text("a", 2800), prompt];
    const due = (
      app: { enabled: boolean; thresholdPercent: number },
      overrides?: Parameters<typeof effectiveCompaction>[1],
    ) => {
      const settings = effectiveCompaction(app, overrides);
      return compactionDue({
        enabled: settings.enabled,
        thresholdPercent: settings.thresholdPercent,
        messages,
        prompt,
        windowTokens: 1000,
      });
    };
    const appOff = { enabled: false, thresholdPercent: 70 };
    const appOn = { enabled: true, thresholdPercent: 70 };
    expect(due(appOff)).toBe(false);
    expect(due(appOff, { compaction: true })).toBe(true);
    expect(due(appOn, { compaction: false })).toBe(false);
    expect(due(appOn, { compactionThreshold: 75 })).toBe(false);
    expect(due(appOn, { compactionThreshold: 50 })).toBe(true);
  });

  it("counts the tokens of attached text files in the prompt", () => {
    const file: Message = text("p", 40, {
      attachments: [{ id: "f", kind: "text", name: "f.md", size: 2760, chars: 2760 }],
    });
    // The prompt's file adds 690 tokens, so 690 + 10 + 0 reaches 70% of 1000 only with the file.
    expect(
      compactionDue({
        enabled: true,
        thresholdPercent: 70,
        messages: [text("a", 0), file],
        prompt: file,
        windowTokens: 1000,
      }),
    ).toBe(true);
  });
});
