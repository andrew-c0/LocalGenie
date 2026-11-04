import { useBenchmarkRunEvents } from "./useBenchmarkRunEvents";

/**
 * Benchmark run side effects with no UI: the progress and end events of a run. Mounted by the main layout,
 * not by a page, so a run keeps updating while the user is on another page.
 */
export function BenchmarkRuntime() {
  useBenchmarkRunEvents();
  return null;
}
