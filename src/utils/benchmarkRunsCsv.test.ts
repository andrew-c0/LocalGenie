import { describe, expect, it } from "vitest";
import type { BenchmarkRunSummary } from "../types";
import { runsCsv } from "./benchmarkRunsCsv";

const run: BenchmarkRunSummary = {
  id: "r1",
  suiteId: "s1",
  suiteName: "Smoke quick",
  modelName: "unsloth/Qwen3.5-0.8B-GGUF",
  modelKey: "unsloth/Qwen3.5-0.8B-GGUF",
  compute: "gpu",
  mode: "independent",
  warmupRuns: 1,
  repetitions: 3,
  status: "completed",
  error: null,
  startedAt: Date.UTC(2026, 9, 25, 12, 0, 0),
  finishedAt: null,
  metrics: {
    stepsCompleted: 6,
    stepsFailed: 0,
    stepsSkipped: 0,
    meanTtftMs: 123.456,
    meanTokensPerSec: 24.9,
    meanTotalMs: 980.4,
    keywordPassed: 2,
    keywordChecked: 3,
    peakModelMemoryBytes: 2238980096,
    meanCpu: 12.34,
    meanGpu: 56.7,
    meanNpu: null,
  },
};

describe("runsCsv", () => {
  it("writes one line per run with rounded figures and empty blanks", () => {
    const lines = runsCsv([run]).replace("﻿", "").trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    const fields = lines[1].split(",");
    expect(fields[0]).toBe("2026-10-25T12:00:00.000Z");
    expect(lines[1]).toContain("Smoke quick");
    expect(fields.slice(8, 11)).toEqual(["123.5", "24.9", "980"]);
    expect(fields.slice(11, 13)).toEqual(["2", "3"]);
    expect(fields[13]).toBe("2238980096");
    expect(fields[16]).toBe("");
    expect(fields[19]).toBe("r1");
  });

  it("leaves keyword columns blank when no check was made", () => {
    const noKeywords = { ...run, metrics: { ...run.metrics, keywordChecked: 0, keywordPassed: 0 } };
    const fields = runsCsv([noKeywords]).split("\r\n")[1].split(",");
    expect(fields[11]).toBe("");
    expect(fields[12]).toBe("");
  });
});
