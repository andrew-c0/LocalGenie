import { describe, expect, it } from "vitest";
import type { BenchmarkFile, BenchmarkPrompt, BenchmarkSuite } from "../types";
import { promptDetail, suiteDetail } from "./benchmarkDetails";

const prompt: BenchmarkPrompt = {
  id: "p1",
  name: "Capital",
  description: null,
  text: "What is the capital of France?",
  matchRule: "any",
  keywords: ["Paris"],
  files: [],
  runCount: 3,
  createdAt: 0,
  updatedAt: 0,
};

const step: BenchmarkSuite["steps"][number] = {
  id: "st1",
  promptId: "p1",
  promptName: "Capital",
  promptFiles: [],
  files: [],
};

const suite: BenchmarkSuite = {
  id: "s1",
  name: "Smoke",
  description: null,
  mode: "conversation",
  warmupRuns: 1,
  repetitions: 1,
  steps: [step],
  runCount: 1,
  createdAt: 0,
  updatedAt: 0,
};

describe("promptDetail", () => {
  it("counts keywords and files in the row's wording", () => {
    expect(promptDetail(prompt)).toBe("1 keyword · 0 files · run 3×");
  });

  it("uses plurals for more than one", () => {
    const file: BenchmarkFile = {
      id: "f1",
      name: "notes.txt",
      kind: "text",
      size: 10,
      chars: 10,
      storedPath: "notes.txt",
      sha256: "abc",
      createdAt: 0,
    };
    expect(promptDetail({ ...prompt, keywords: ["a", "b"], files: [file], runCount: 0 })).toBe(
      "2 keywords · 1 file · run 0×",
    );
  });
});

describe("suiteDetail", () => {
  it("counts steps and repetitions with the mode and run count", () => {
    expect(suiteDetail(suite)).toBe("1 step · conversation · 1 rep · run 1×");
  });

  it("pluralises steps and repetitions", () => {
    const next: BenchmarkSuite = {
      ...suite,
      steps: [step, { ...step, id: "st2" }],
      repetitions: 3,
      mode: "independent",
    };
    expect(suiteDetail(next)).toBe("2 steps · independent · 3 reps · run 1×");
  });
});
