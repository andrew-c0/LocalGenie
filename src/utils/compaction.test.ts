import { describe, expect, it, vi } from "vitest";
import type { Message } from "../types";
import {
  canRemoveFrom,
  coveredMessageIds,
  isCoveredBySummary,
  isSummaryMessage,
  latestSummary,
  messagesAfterSummary,
  messagesBefore,
  SUMMARY_SYSTEM_TYPE,
  shouldCompact,
  summaryInputFor,
  summaryRowFor,
  systemPromptWithSummary,
} from "./compaction";

function msg(id: string, role: Message["role"], content: string, extra: Partial<Message> = {}) {
  return { id, role, content, timestamp: 1, ...extra } satisfies Message;
}

function summaryRow(id: string, content: string, coversThroughId: string | null): Message {
  return {
    id,
    role: "system",
    kind: "system",
    systemType: SUMMARY_SYSTEM_TYPE,
    content,
    timestamp: 1,
    coversThroughId,
  };
}

const modelLine = (id: string): Message => ({
  id,
  role: "system",
  kind: "system",
  systemType: "model_changed",
  content: "Model: x",
  timestamp: 1,
});

describe("isSummaryMessage", () => {
  it("is true only for a system line of type summary", () => {
    expect(isSummaryMessage(summaryRow("s", "x", null))).toBe(true);
    expect(isSummaryMessage(modelLine("m"))).toBe(false);
    expect(isSummaryMessage(msg("u", "user", "x", { systemType: SUMMARY_SYSTEM_TYPE }))).toBe(
      false,
    );
  });
});

describe("latestSummary", () => {
  it("returns the newest summary row, or null when there is none", () => {
    const messages = [
      summaryRow("s1", "first", "a"),
      msg("a", "user", "hi"),
      summaryRow("s2", "second", "a"),
    ];
    expect(latestSummary(messages)?.id).toBe("s2");
    expect(latestSummary([msg("a", "user", "hi")])).toBeNull();
  });
});

describe("messagesAfterSummary", () => {
  it("returns the messages after the newest summary, without system lines", () => {
    const messages = [
      msg("a", "user", "old"),
      summaryRow("s", "summary", "a"),
      modelLine("m"),
      msg("b", "user", "new"),
      msg("c", "assistant", "reply"),
    ];
    expect(messagesAfterSummary(messages).map((m) => m.id)).toEqual(["b", "c"]);
  });

  it("returns every message but system lines when there is no summary", () => {
    const messages = [msg("a", "user", "hi"), modelLine("m"), msg("b", "assistant", "yo")];
    expect(messagesAfterSummary(messages).map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("isCoveredBySummary", () => {
  const messages = [
    msg("a", "user", "one"),
    msg("b", "assistant", "two"),
    msg("c", "user", "three"),
    summaryRow("s", "summary", "b"),
    msg("d", "user", "four"),
  ];

  it("covers messages up to and including coversThroughId", () => {
    expect(isCoveredBySummary(messages, "a")).toBe(true);
    expect(isCoveredBySummary(messages, "b")).toBe(true);
  });

  it("does not cover messages after coversThroughId", () => {
    expect(isCoveredBySummary(messages, "c")).toBe(false);
    expect(isCoveredBySummary(messages, "d")).toBe(false);
  });

  it("covers the summary row itself", () => {
    expect(isCoveredBySummary(messages, "s")).toBe(true);
  });

  it("is false for an unknown id, and when no summary exists", () => {
    expect(isCoveredBySummary(messages, "missing")).toBe(false);
    expect(isCoveredBySummary([msg("a", "user", "x")], "a")).toBe(false);
  });

  it("uses the furthest coversThroughId when several summaries exist", () => {
    const later = [
      msg("a", "user", "one"),
      summaryRow("s1", "first", "a"),
      msg("b", "user", "two"),
      msg("c", "assistant", "three"),
      summaryRow("s2", "second", "c"),
      msg("d", "user", "four"),
    ];
    expect(isCoveredBySummary(later, "b")).toBe(true);
    expect(isCoveredBySummary(later, "c")).toBe(true);
    expect(isCoveredBySummary(later, "d")).toBe(false);
  });
});

describe("coveredMessageIds", () => {
  it("is the covered messages and the summary rows, and nothing after the covered range", () => {
    const messages = [
      msg("a", "user", "one"),
      msg("b", "assistant", "two"),
      summaryRow("s", "summary", "b"),
      msg("c", "user", "three"),
    ];
    expect([...coveredMessageIds(messages)].sort()).toEqual(["a", "b", "s"]);
  });

  it("is empty when no summary exists", () => {
    expect(coveredMessageIds([msg("a", "user", "one")]).size).toBe(0);
  });
});

describe("canRemoveFrom", () => {
  const messages = [
    msg("a", "user", "one"),
    msg("b", "assistant", "two"),
    summaryRow("s", "summary", "b"),
    msg("c", "user", "three"),
    msg("d", "assistant", "four"),
  ];

  it("allows removing from a message after the summary", () => {
    expect(canRemoveFrom(messages, 3)).toBe(true);
    expect(canRemoveFrom(messages, 4)).toBe(true);
  });

  it("refuses a covered message, and any range that reaches back into the covered part", () => {
    expect(canRemoveFrom(messages, 0)).toBe(false);
    expect(canRemoveFrom(messages, 1)).toBe(false);
  });

  it("refuses a summary row, and a range that contains one", () => {
    expect(canRemoveFrom(messages, 2)).toBe(false);
    // Past the covered part, but a later summary row sits in the range that would be removed.
    const withLaterSummary = [
      msg("x", "user", "one"),
      msg("y", "assistant", "two"),
      summaryRow("s1", "first", "x"),
      msg("z", "user", "three"),
      summaryRow("s2", "second", null),
    ];
    expect(canRemoveFrom(withLaterSummary, 3)).toBe(false);
  });

  it("refuses an index that is not in the list", () => {
    expect(canRemoveFrom(messages, -1)).toBe(false);
  });
});

describe("messagesBefore", () => {
  it("returns the messages before the id, or all of them when the id is missing", () => {
    const messages = [msg("a", "user", "one"), msg("b", "assistant", "two")];
    expect(messagesBefore(messages, "b")).toEqual([messages[0]]);
    expect(messagesBefore(messages, "missing")).toEqual(messages);
  });
});

describe("summaryInputFor errors", () => {
  it("keeps error text out of the summary input", () => {
    const messages = [
      msg("u1", "user", "question"),
      msg("e1", "assistant", "⚠️ Error: Server returned 400", { isError: true }),
      msg("u2", "user", "next"),
    ];
    const input = summaryInputFor(messages, "u2");
    expect(input.items).toEqual([{ role: "user", content: "question" }]);
    expect(input.coversThroughId).toBe("e1");
  });
});

describe("summaryInputFor", () => {
  it("collects the messages before the new prompt and the id of the last of them", () => {
    const messages = [
      msg("u1", "user", "first question"),
      msg("a1", "assistant", "first answer"),
      msg("u2", "user", "new prompt"),
    ];
    expect(summaryInputFor(messages, "u2")).toEqual({
      previousSummary: null,
      items: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
      ],
      coversThroughId: "a1",
    });
  });

  it("removes thinking from assistant replies", () => {
    const messages = [
      msg("u1", "user", "question"),
      msg("a1", "assistant", "<think>reasoning here</think>The answer."),
      msg("u2", "user", "next"),
    ];
    expect(summaryInputFor(messages, "u2").items[1]).toEqual({
      role: "assistant",
      content: "The answer.",
    });
  });

  it("reduces attachments to a line naming them", () => {
    const messages = [
      msg("u1", "user", "look at these", {
        attachments: [
          { id: "f1", kind: "image", name: "chart.png", size: 10 },
          { id: "f2", kind: "text", name: "notes.md", size: 10, chars: 10 },
        ],
      }),
      msg("u2", "user", "next"),
    ];
    expect(summaryInputFor(messages, "u2").items).toEqual([
      { role: "user", content: "look at these\nUser attached: chart.png, notes.md" },
    ]);
  });

  it("keeps an attachment line for a message with no text", () => {
    const messages = [
      msg("u1", "user", "", {
        attachments: [{ id: "f1", kind: "audio", name: "clip.wav", size: 10 }],
      }),
      msg("u2", "user", "next"),
    ];
    expect(summaryInputFor(messages, "u2").items).toEqual([
      { role: "user", content: "User attached: clip.wav" },
    ]);
  });

  it("drops empty items and system lines", () => {
    const messages = [
      msg("u1", "user", "question"),
      msg("a1", "assistant", "<think>only thinking</think>"),
      modelLine("m"),
      msg("a2", "assistant", "   "),
      msg("u2", "user", "next"),
    ];
    const input = summaryInputFor(messages, "u2");
    expect(input.items).toEqual([{ role: "user", content: "question" }]);
    expect(input.coversThroughId).toBe("a2");
  });

  it("starts from the newest summary and passes its text as the previous summary", () => {
    const messages = [
      msg("u1", "user", "old question"),
      summaryRow("s", "Earlier: a chat about cats.", "u1"),
      msg("u2", "user", "after the summary"),
      msg("a2", "assistant", "reply"),
      msg("u3", "user", "new prompt"),
    ];
    expect(summaryInputFor(messages, "u3")).toEqual({
      previousSummary: "Earlier: a chat about cats.",
      items: [
        { role: "user", content: "after the summary" },
        { role: "assistant", content: "reply" },
      ],
      coversThroughId: "a2",
    });
  });

  it("returns no items and no covered id when the prompt is the first message", () => {
    const input = summaryInputFor([msg("u1", "user", "hi")], "u1");
    expect(input).toEqual({ previousSummary: null, items: [], coversThroughId: null });
  });

  it("treats a prompt missing from the list as not yet added", () => {
    const messages = [msg("u1", "user", "hi"), msg("a1", "assistant", "yo")];
    expect(summaryInputFor(messages, "new").coversThroughId).toBe("a1");
  });
});

describe("shouldCompact", () => {
  const base = { usedTokens: 0, newPromptTokens: 0, windowTokens: 1000, thresholdPercent: 70 };

  it("is true at exactly the threshold share of the window", () => {
    expect(shouldCompact({ ...base, usedTokens: 600, newPromptTokens: 100 })).toBe(true);
  });

  it("is true above the threshold", () => {
    expect(shouldCompact({ ...base, usedTokens: 900 })).toBe(true);
  });

  it("is false below the threshold", () => {
    expect(shouldCompact({ ...base, usedTokens: 500, newPromptTokens: 199 })).toBe(false);
  });

  it("is false for a window with no size", () => {
    expect(shouldCompact({ ...base, windowTokens: 0, usedTokens: 10 })).toBe(false);
  });
});

describe("systemPromptWithSummary", () => {
  it("appends the summary as its own block after the prompt", () => {
    expect(systemPromptWithSummary("Be brief.", "The user likes cats.")).toBe(
      "Be brief.\n\nSummary of the conversation so far (automatic):\nThe user likes cats.",
    );
  });

  it("is the block alone when the prompt is empty", () => {
    expect(systemPromptWithSummary("  ", "Facts.")).toBe(
      "Summary of the conversation so far (automatic):\nFacts.",
    );
  });

  it("is unchanged when there is no summary", () => {
    expect(systemPromptWithSummary("Be brief.", null)).toBe("Be brief.");
    expect(systemPromptWithSummary("", null)).toBe("");
    expect(systemPromptWithSummary("Be brief.", "  ")).toBe("Be brief.");
  });
});

describe("summaryRowFor", () => {
  it("builds a summary system line one millisecond before the prompt", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValueOnce("00000000-0000-4000-8000-000000000000");
    const row = summaryRowFor({
      sessionId: "session-1",
      summary: "Facts so far.",
      coversThroughId: "a1",
      beforeMessage: { timestamp: 5000 },
    });
    expect(row).toEqual({
      id: "00000000-0000-4000-8000-000000000000",
      role: "system",
      kind: "system",
      systemType: "summary",
      content: "Facts so far.",
      timestamp: 4999,
      coversThroughId: "a1",
    });
    expect(isSummaryMessage(row)).toBe(true);
    vi.restoreAllMocks();
  });
});
