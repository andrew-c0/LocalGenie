import { describe, expect, it } from "vitest";
import type { BenchmarkRunSummary } from "../types";
import { groupRuns, metricValue, runSeries, timeSeries } from "./compare";

function run(
  id: string,
  patch: Partial<BenchmarkRunSummary> & {
    ttft?: number | null;
    passed?: number;
    checked?: number;
    ram?: number | null;
  },
): BenchmarkRunSummary {
  return {
    id,
    suiteId: "s1",
    suiteName: "Smoke",
    modelName: patch.modelName ?? "m1",
    modelKey: "m1",
    compute: patch.compute ?? "npu",
    mode: "independent",
    warmupRuns: 1,
    repetitions: 3,
    status: "completed",
    error: null,
    startedAt: patch.startedAt ?? 1000,
    finishedAt: null,
    metrics: {
      stepsCompleted: 3,
      stepsFailed: 0,
      stepsSkipped: 0,
      meanTtftMs: patch.ttft === undefined ? 100 : patch.ttft,
      meanTokensPerSec: 20,
      meanTotalMs: 1000,
      keywordPassed: patch.passed ?? 0,
      keywordChecked: patch.checked ?? 0,
      peakModelMemoryBytes: patch.ram === undefined ? 1024 ** 3 : patch.ram,
      meanCpu: null,
      meanGpu: null,
      meanNpu: null,
    },
  };
}

describe("metricValue", () => {
  it("reads each figure, converting RAM to GB and keywords to a percentage", () => {
    const r = run("a", { passed: 1, checked: 4, ram: 2 * 1024 ** 3 });
    expect(metricValue(r, "ttft")).toBe(100);
    expect(metricValue(r, "ram")).toBe(2);
    expect(metricValue(r, "keywords")).toBe(25);
  });

  it("has no keyword rate when no check was made", () => {
    expect(metricValue(run("a", {}), "keywords")).toBeNull();
  });
});

describe("groupRuns", () => {
  it("gives mean, min, max and count per model", () => {
    const runs = [
      run("a", { ttft: 100 }),
      run("b", { ttft: 300 }),
      run("c", { ttft: 200, modelName: "m2" }),
    ];
    const groups = groupRuns(runs, "ttft", "model");
    expect(groups).toEqual([
      { key: "m1", mean: 200, min: 100, max: 300, runs: 2 },
      { key: "m2", mean: 200, min: 200, max: 200, runs: 1 },
    ]);
  });

  it("groups by compute target and skips runs without the figure", () => {
    const runs = [run("a", { compute: "gpu", ttft: 50 }), run("b", { compute: "npu", ttft: null })];
    expect(groupRuns(runs, "ttft", "compute")).toEqual([
      { key: "GPU", mean: 50, min: 50, max: 50, runs: 1 },
    ]);
  });
});

describe("timeSeries", () => {
  it("makes one series per model and compute, ordered by start time", () => {
    const runs = [
      run("late", { startedAt: 3000, ttft: 30 }),
      run("early", { startedAt: 1000, ttft: 10 }),
      run("other", { startedAt: 2000, ttft: 20, compute: "gpu" }),
    ];
    const series = timeSeries(runs, "ttft");
    expect(series.map((s) => s.legend)).toEqual(["m1 · GPU", "m1 · NPU"]);
    expect(series[1].points.map((p) => p.y)).toEqual([10, 30]);
  });
});

describe("runSeries", () => {
  it("numbers runs in start order, evenly spaced whatever the gap between them", () => {
    const runs = [
      run("late", { startedAt: 9_000_000, ttft: 30 }),
      run("early", { startedAt: 1000, ttft: 10 }),
      run("middle", { startedAt: 500_000, ttft: 20 }),
    ];
    const [series] = runSeries(runs, "ttft");
    expect(series.points.map((p) => p.x)).toEqual([1, 2, 3]);
    expect(series.points.map((p) => p.y)).toEqual([10, 20, 30]);
    expect(series.points[0].label.startsWith("Run 1 · ")).toBe(true);
  });
});
