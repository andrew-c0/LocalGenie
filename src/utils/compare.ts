import type { BenchmarkRunSummary, ComputeTarget } from "../types";

export type CompareMetric = "ttft" | "tokensPerSec" | "totalMs" | "ram" | "keywords";
export type GroupBy = "model" | "compute" | "time";

export const METRICS: Record<CompareMetric, { label: string; unit: string }> = {
  ttft: { label: "Mean TTFT", unit: "ms" },
  tokensPerSec: { label: "Mean tokens/s", unit: "tok/s" },
  totalMs: { label: "Mean total time", unit: "ms" },
  ram: { label: "Peak model RAM", unit: "GB" },
  keywords: { label: "Keyword pass rate", unit: "%" },
};

/** The run's figure for a metric, or null when the run has none. */
export function metricValue(run: BenchmarkRunSummary, metric: CompareMetric): number | null {
  const m = run.metrics;
  switch (metric) {
    case "ttft":
      return m.meanTtftMs;
    case "tokensPerSec":
      return m.meanTokensPerSec;
    case "totalMs":
      return m.meanTotalMs;
    case "ram":
      return m.peakModelMemoryBytes === null ? null : m.peakModelMemoryBytes / 1024 ** 3;
    case "keywords":
      return m.keywordChecked === 0 ? null : (100 * m.keywordPassed) / m.keywordChecked;
  }
}

export interface Group {
  key: string;
  /** Mean of the runs' figures. */
  mean: number;
  min: number;
  max: number;
  /** Runs that had a figure for the metric. */
  runs: number;
}

/** Group runs by model or compute target. Each group's mean, min and max are over its runs. */
export function groupRuns(
  runs: BenchmarkRunSummary[],
  metric: CompareMetric,
  by: "model" | "compute",
): Group[] {
  const buckets = new Map<string, number[]>();
  for (const run of runs) {
    const value = metricValue(run, metric);
    if (value === null) continue;
    const key = by === "model" ? run.modelName : run.compute.toUpperCase();
    buckets.set(key, [...(buckets.get(key) ?? []), value]);
  }
  return [...buckets.entries()]
    .map(([key, values]) => ({
      key,
      mean: values.reduce((sum, v) => sum + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      runs: values.length,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface TimeSeries {
  legend: string;
  compute: ComputeTarget;
  points: { x: Date; y: number }[];
}

/** One series per model and compute target, with each run as a point at its start time. */
export function timeSeries(runs: BenchmarkRunSummary[], metric: CompareMetric): TimeSeries[] {
  const series = new Map<string, TimeSeries>();
  const ordered = [...runs].sort((a, b) => a.startedAt - b.startedAt);
  for (const run of ordered) {
    const value = metricValue(run, metric);
    if (value === null) continue;
    const legend = `${run.modelName} · ${run.compute.toUpperCase()}`;
    const entry = series.get(legend) ?? { legend, compute: run.compute, points: [] };
    entry.points.push({ x: new Date(run.startedAt), y: value });
    series.set(legend, entry);
  }
  return [...series.values()].sort((a, b) => a.legend.localeCompare(b.legend));
}

/** One run's figure, placed at its position in start order. */
export interface RunPoint {
  /** Run number: 1 for the earliest run in the selection. */
  x: number;
  y: number;
  /** Shown on hover: the run number and its start time. */
  label: string;
}

export interface RunSeries {
  legend: string;
  compute: ComputeTarget;
  points: RunPoint[];
}

/**
 * One series per model and compute target, with each run at its position in start order. Spacing is
 * even whatever the gap between runs, so consecutive runs sit next to each other.
 */
export function runSeries(runs: BenchmarkRunSummary[], metric: CompareMetric): RunSeries[] {
  const ordered = [...runs].sort((a, b) => a.startedAt - b.startedAt);
  const series = new Map<string, RunSeries>();
  ordered.forEach((run, index) => {
    const value = metricValue(run, metric);
    if (value === null) return;
    const legend = `${run.modelName} · ${run.compute.toUpperCase()}`;
    const entry = series.get(legend) ?? { legend, compute: run.compute, points: [] };
    const number = index + 1;
    entry.points.push({
      x: number,
      y: value,
      label: `Run ${number} · ${new Date(run.startedAt).toLocaleString()}`,
    });
    series.set(legend, entry);
  });
  return [...series.values()].sort((a, b) => a.legend.localeCompare(b.legend));
}
