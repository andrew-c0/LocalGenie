import { describe, expect, it } from "vitest";
import type { BenchmarkRunSummary } from "../types";
import { isRunSortColumn, sortRuns } from "./benchmarkRunSort";
import { pageOf } from "./pagination";

function run(id: string, overrides: Partial<BenchmarkRunSummary> = {}, ttft: number | null = 100) {
  const base: BenchmarkRunSummary = {
    id,
    suiteId: "s1",
    suiteName: "Suite",
    modelName: "model",
    modelKey: "model",
    compute: "cpu",
    mode: "independent",
    warmupRuns: 0,
    repetitions: 1,
    status: "completed",
    error: null,
    startedAt: 0,
    finishedAt: null,
    metrics: {
      stepsCompleted: 1,
      stepsFailed: 0,
      stepsSkipped: 0,
      meanTtftMs: ttft,
      meanTokensPerSec: null,
      meanTotalMs: null,
      keywordPassed: 0,
      keywordChecked: 0,
      peakModelMemoryBytes: null,
      meanCpu: null,
      meanGpu: null,
      meanNpu: null,
    },
  };
  return { ...base, ...overrides };
}

const ids = (runs: BenchmarkRunSummary[]) => runs.map((r) => r.id);

describe("sortRuns", () => {
  it("keeps the given order with no sort, as a new array", () => {
    const runs = [run("a"), run("b")];
    const result = sortRuns(runs, null);
    expect(ids(result)).toEqual(["a", "b"]);
    expect(result).not.toBe(runs);
  });

  it("sorts a date column both ways", () => {
    const runs = [
      run("mid", { startedAt: 2 }),
      run("old", { startedAt: 1 }),
      run("new", { startedAt: 3 }),
    ];
    expect(ids(sortRuns(runs, { columnId: "started", direction: "ascending" }))).toEqual([
      "old",
      "mid",
      "new",
    ]);
    expect(ids(sortRuns(runs, { columnId: "started", direction: "descending" }))).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("sorts a text column with a locale compare", () => {
    const runs = [run("b", { suiteName: "Beta" }), run("a", { suiteName: "alpha" })];
    expect(ids(sortRuns(runs, { columnId: "suite", direction: "ascending" }))).toEqual(["a", "b"]);
  });

  it("puts missing numbers first when ascending and last when descending", () => {
    const runs = [run("one", {}, 5), run("none", {}, null), run("two", {}, 9)];
    expect(ids(sortRuns(runs, { columnId: "ttft", direction: "ascending" }))).toEqual([
      "none",
      "one",
      "two",
    ]);
    expect(ids(sortRuns(runs, { columnId: "ttft", direction: "descending" }))).toEqual([
      "two",
      "one",
      "none",
    ]);
  });

  it("does not change the input array", () => {
    const runs = [run("b", { startedAt: 2 }), run("a", { startedAt: 1 })];
    sortRuns(runs, { columnId: "started", direction: "ascending" });
    expect(ids(runs)).toEqual(["b", "a"]);
  });

  it("sorts the whole set before a page is taken, so page 1 holds the top of the sort", () => {
    const runs = Array.from({ length: 25 }, (_, i) => run(`r${i}`, { startedAt: i }));
    const sorted = sortRuns(runs, { columnId: "started", direction: "descending" });
    const firstPage = pageOf(sorted, 1, 10);
    expect(firstPage[0].id).toBe("r24");
    expect(firstPage[9].id).toBe("r15");
    expect(pageOf(sorted, 3, 10).map((r) => r.id)).toEqual(["r4", "r3", "r2", "r1", "r0"]);
  });
});

describe("isRunSortColumn", () => {
  it("accepts the sortable columns", () => {
    expect(isRunSortColumn("memory")).toBe(true);
    expect(isRunSortColumn("started")).toBe(true);
  });

  it("rejects the Details column and inherited object keys", () => {
    expect(isRunSortColumn("details")).toBe(false);
    expect(isRunSortColumn("constructor")).toBe(false);
  });
});
