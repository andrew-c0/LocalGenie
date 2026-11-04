import type { BenchmarkPrompt, BenchmarkSuite } from "../types";
import { countLabel } from "./format";

/** The detail line of a prompt row, for example "2 keywords · 0 files · run 3×". */
export function promptDetail(prompt: BenchmarkPrompt): string {
  return [
    countLabel(prompt.keywords.length, "keyword", "keywords"),
    countLabel(prompt.files.length, "file", "files"),
    `run ${prompt.runCount}×`,
  ].join(" · ");
}

/** The detail line of a suite row, for example "3 steps · conversation · 3 reps · run 2×". */
export function suiteDetail(suite: BenchmarkSuite): string {
  return [
    countLabel(suite.steps.length, "step", "steps"),
    suite.mode,
    countLabel(suite.repetitions, "rep", "reps"),
    `run ${suite.runCount}×`,
  ].join(" · ");
}
