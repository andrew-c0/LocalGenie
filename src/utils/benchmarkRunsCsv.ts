import type { BenchmarkRunSummary } from "../types";
import { buildCsv, type CsvValue } from "./csv";

const HEADER = [
  "Started",
  "Suite",
  "Model",
  "Compute",
  "Mode",
  "Warmup passes",
  "Repetitions",
  "Status",
  "Mean TTFT (ms)",
  "Mean tokens/s",
  "Mean total (ms)",
  "Keywords passed",
  "Keywords checked",
  "Peak model memory (bytes)",
  "Mean CPU (%)",
  "Mean GPU (%)",
  "Mean NPU (%)",
  "Steps failed",
  "Steps skipped",
  "Run id",
];

function rounded(value: number | null, digits: number): CsvValue {
  return value === null ? null : Number(value.toFixed(digits));
}

/** One CSV line per run, in the order given. */
export function runsCsv(runs: BenchmarkRunSummary[]): string {
  const rows: CsvValue[][] = runs.map((run) => {
    const m = run.metrics;
    return [
      new Date(run.startedAt).toISOString(),
      run.suiteName,
      run.modelName,
      run.compute,
      run.mode,
      run.warmupRuns,
      run.repetitions,
      run.status,
      rounded(m.meanTtftMs, 1),
      rounded(m.meanTokensPerSec, 2),
      rounded(m.meanTotalMs, 0),
      m.keywordChecked > 0 ? m.keywordPassed : null,
      m.keywordChecked > 0 ? m.keywordChecked : null,
      m.peakModelMemoryBytes,
      rounded(m.meanCpu, 1),
      rounded(m.meanGpu, 1),
      rounded(m.meanNpu, 1),
      m.stepsFailed,
      m.stepsSkipped,
      run.id,
    ];
  });
  return buildCsv(HEADER, rows);
}
