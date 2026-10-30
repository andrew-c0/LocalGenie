import { describe, expect, it } from "vitest";
import type { EnhanceKind } from "../types";
import { ENHANCE_TASK_OPTIONS, enhanceOutputHelp } from "./audioText";

describe("ENHANCE_TASK_OPTIONS", () => {
  it("offers each audio to audio kind once, with its task label", () => {
    expect(ENHANCE_TASK_OPTIONS).toEqual([
      ["denoise", "Clean up speech"],
      ["separate", "Split voice and music"],
    ]);
  });
});

describe("enhanceOutputHelp", () => {
  const kinds: EnhanceKind[] = ["denoise", "separate"];

  it("says cleaned speech is 16 kHz mono and splitting keeps the original quality", () => {
    expect(enhanceOutputHelp("denoise")).toContain("16 kHz mono");
    expect(enhanceOutputHelp("separate")).toContain("original quality");
  });

  it("gives every task a line of its own", () => {
    const lines = kinds.map(enhanceOutputHelp);
    expect(new Set(lines).size).toBe(kinds.length);
    for (const line of lines) expect(line.length).toBeGreaterThan(0);
  });
});
