import type { BenchmarkRunSummary } from "../types";

/** The columns of the Runs table that can be sorted. The Details column is not one of them. */
export const RUN_SORT_COLUMNS = [
  "started",
  "suite",
  "model",
  "compute",
  "status",
  "ttft",
  "tps",
  "keywords",
  "memory",
] as const;

export type RunSortColumn = (typeof RUN_SORT_COLUMNS)[number];
export type RunSortDirection = "ascending" | "descending";

export interface RunSort {
  columnId: RunSortColumn;
  direction: RunSortDirection;
}

/** Missing numbers (null) sort below every number. */
function compareNumbers(a: number | null, b: number | null): number {
  return (a ?? Number.NEGATIVE_INFINITY) - (b ?? Number.NEGATIVE_INFINITY);
}

/** Ascending comparison for each sortable column. */
export const RUN_COMPARERS: Record<
  RunSortColumn,
  (a: BenchmarkRunSummary, b: BenchmarkRunSummary) => number
> = {
  started: (a, b) => a.startedAt - b.startedAt,
  suite: (a, b) => a.suiteName.localeCompare(b.suiteName),
  model: (a, b) => a.modelName.localeCompare(b.modelName),
  compute: (a, b) => a.compute.localeCompare(b.compute),
  status: (a, b) => a.status.localeCompare(b.status),
  ttft: (a, b) => compareNumbers(a.metrics.meanTtftMs, b.metrics.meanTtftMs),
  tps: (a, b) => compareNumbers(a.metrics.meanTokensPerSec, b.metrics.meanTokensPerSec),
  keywords: (a, b) => a.metrics.keywordPassed - b.metrics.keywordPassed,
  memory: (a, b) => compareNumbers(a.metrics.peakModelMemoryBytes, b.metrics.peakModelMemoryBytes),
};

export function isRunSortColumn(columnId: string): columnId is RunSortColumn {
  return (RUN_SORT_COLUMNS as readonly string[]).includes(columnId);
}

/**
 * The runs in sort order, as a new array. With no sort, the runs keep their given order. Sort the
 * whole filtered set with this before taking a page, so the page shows the top of the sort.
 */
export function sortRuns(
  runs: readonly BenchmarkRunSummary[],
  sort: RunSort | null,
): BenchmarkRunSummary[] {
  if (sort === null) return [...runs];
  const compare = RUN_COMPARERS[sort.columnId];
  const sign = sort.direction === "ascending" ? 1 : -1;
  return [...runs].sort((a, b) => compare(a, b) * sign);
}
