import { describe, expect, it } from "vitest";
import { RESULT_MAX_CHARS, RESULT_MIN_CHARS, resultBudgetChars } from "./resultBudget";

describe("resultBudgetChars", () => {
  it("is 15% of the window at 3.5 characters per token", () => {
    // 4096 * 0.15 * 3.5 = 2150.4, rounded to 2150.
    expect(resultBudgetChars(4096)).toBe(2150);
    // 8192 * 0.15 * 3.5 = 4300.8, rounded to 4301.
    expect(resultBudgetChars(8192)).toBe(4301);
  });

  it("gives a 32k window a larger budget than a 4k one", () => {
    expect(resultBudgetChars(32768)).toBe(17203);
    expect(resultBudgetChars(32768)).toBeGreaterThan(resultBudgetChars(4096) ?? 0);
  });

  it("never goes below the minimum, so a tiny window still reads a page", () => {
    expect(resultBudgetChars(512)).toBe(RESULT_MIN_CHARS);
    expect(resultBudgetChars(1)).toBe(RESULT_MIN_CHARS);
  });

  it("never goes above the maximum", () => {
    expect(resultBudgetChars(1_000_000)).toBe(RESULT_MAX_CHARS);
  });

  it("is undefined when the window is not known, so the backend default applies", () => {
    expect(resultBudgetChars(null)).toBeUndefined();
    expect(resultBudgetChars(undefined)).toBeUndefined();
  });

  it("is undefined for a window that cannot be a size", () => {
    expect(resultBudgetChars(0)).toBeUndefined();
    expect(resultBudgetChars(-4096)).toBeUndefined();
    expect(resultBudgetChars(Number.NaN)).toBeUndefined();
    expect(resultBudgetChars(Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
