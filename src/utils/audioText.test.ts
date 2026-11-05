import { describe, expect, it } from "vitest";
import type { EnhanceKind } from "../types";
import {
  AUDIO_TASK_OPTIONS,
  audioActionLabel,
  audioTaskLabelOf,
  ENHANCE_TASK_OPTIONS,
  enhanceOutputHelp,
} from "./audioText";

describe("ENHANCE_TASK_OPTIONS", () => {
  it("offers each clean up or split kind once, with its task label", () => {
    expect(ENHANCE_TASK_OPTIONS).toEqual([
      ["denoise", "Clean up speech"],
      ["separate", "Split voice and music"],
    ]);
  });
});

describe("AUDIO_TASK_OPTIONS", () => {
  it("offers the three Audio tasks in order, with their labels", () => {
    expect(AUDIO_TASK_OPTIONS).toEqual([
      ["transcribe", "Speech to text"],
      ["speak", "Text to speech"],
      ["enhance", "Clean up and split"],
    ]);
  });

  it("names a task by its label", () => {
    expect(audioTaskLabelOf("speak")).toBe("Text to speech");
  });
});

describe("audioActionLabel", () => {
  it("names the primary action of each task", () => {
    expect(audioActionLabel("transcribe", "denoise")).toBe("Transcribe");
    expect(audioActionLabel("speak", "denoise")).toBe("Speak");
  });

  it("names clean up or split by the kind the enhance task is set to", () => {
    expect(audioActionLabel("enhance", "denoise")).toBe("Clean up");
    expect(audioActionLabel("enhance", "separate")).toBe("Split");
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
