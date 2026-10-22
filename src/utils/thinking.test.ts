import { describe, expect, it } from "vitest";
import { parseThinking } from "./thinking";

describe("parseThinking", () => {
  it("returns the whole text as answer when there is no thinking block", () => {
    expect(parseThinking("Hello there")).toEqual({
      thinking: "",
      answer: "Hello there",
      thinkingOpen: false,
    });
  });

  it("separates a closed thinking block from the answer", () => {
    const parsed = parseThinking("<think>\nCheck units first.\n</think>\n\nThe answer is 4.");
    expect(parsed.thinking).toBe("Check units first.");
    expect(parsed.answer).toBe("The answer is 4.");
    expect(parsed.thinkingOpen).toBe(false);
  });

  it("reports an open block while it is still streaming", () => {
    const parsed = parseThinking("<think>Let me consider");
    expect(parsed.thinking).toBe("Let me consider");
    expect(parsed.answer).toBe("");
    expect(parsed.thinkingOpen).toBe(true);
  });

  it("keeps answer text that comes after the reasoning has started streaming", () => {
    const parsed = parseThinking("Intro <think>x</think> tail");
    expect(parsed.answer).toBe("Intro  tail");
  });

  it("holds back a partial opening tag so it never shows as answer text", () => {
    expect(parseThinking("Sure <thi").answer).toBe("Sure");
    expect(parseThinking("<").answer).toBe("");
  });

  it("joins several thinking blocks", () => {
    const parsed = parseThinking("<think>one</think>mid<think>two</think>end");
    expect(parsed.thinking).toBe("one\n\ntwo");
    expect(parsed.answer).toBe("midend");
  });

  it("treats text before a close tag as thinking when the open tag was in the prompt", () => {
    const parsed = parseThinking("reasoning\n</think>\n\n5");
    expect(parsed.thinking).toBe("reasoning");
    expect(parsed.answer).toBe("5");
    expect(parsed.thinkingOpen).toBe(false);
  });

  it("keeps an explicit leading block working when a later close tag exists", () => {
    const parsed = parseThinking("<think>plan</think>\n\n5");
    expect(parsed.thinking).toBe("plan");
    expect(parsed.answer).toBe("5");
    expect(parsed.thinkingOpen).toBe(false);
  });

  it("parses blocks after an implicit opening block", () => {
    const parsed = parseThinking("first\n</think>answer <think>second</think> end");
    expect(parsed.thinking).toBe("first\n\nsecond");
    expect(parsed.answer).toBe("answer  end");
  });

  it("returns a reply with no tags as answer only", () => {
    expect(parseThinking("Just a plain answer.")).toEqual({
      thinking: "",
      answer: "Just a plain answer.",
      thinkingOpen: false,
    });
  });
});
