import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import { stepLogLine } from "./dispatchLog";

const reply: Message = {
  id: "r1",
  role: "assistant",
  content: "ok",
  timestamp: 1,
  usage: { promptTokens: 112, completionTokens: 40 },
  stats: { timeToFirstToken: 300, totalTime: 2750, tokenCount: 40, promptChars: 900 },
};

describe("stepLogLine", () => {
  it("shows the step, the prompt and completion tokens and the time of the reply", () => {
    expect(stepLogLine(7, reply)).toBe(
      "[dispatch] step 7: prompt_tokens=112, completion_tokens=40, ms=2750",
    );
  });

  it("reads a value the reply does not carry as n/a", () => {
    const withoutUsage: Message = { ...reply, usage: undefined };
    expect(stepLogLine(2, withoutUsage)).toBe(
      "[dispatch] step 2: prompt_tokens=n/a, completion_tokens=n/a, ms=2750",
    );
  });

  it("reads every value as n/a when there is no reply", () => {
    expect(stepLogLine(1, undefined)).toBe(
      "[dispatch] step 1: prompt_tokens=n/a, completion_tokens=n/a, ms=n/a",
    );
  });
});
