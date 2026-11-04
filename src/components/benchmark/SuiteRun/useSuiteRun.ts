import { useCallback } from "react";
import { cancelBenchmarkRun, startBenchmarkRun } from "../../../services/benchmark";
import { type BenchmarkRunPhase, useBenchmarkRunStore } from "../../../stores/benchmarkRunStore";
import type { BenchmarkRunRequest } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/**
 * The run as one suite's page sees it, and the start and cancel actions. The run and its events live in
 * `benchmarkRunStore`, so leaving the page does not stop or lose the run. This page sees a run only when
 * it is this suite's; one run executes at a time, so `busyElsewhere` blocks a start while another suite runs.
 */
export function useSuiteRun(suiteId: string) {
  const store = useBenchmarkRunStore((s) => s);
  const ownRun = store.suiteId === suiteId;

  const start = useCallback(async (params: Omit<BenchmarkRunRequest, "runId">) => {
    const runId = crypto.randomUUID();
    useBenchmarkRunStore.getState().begin(runId, params.suiteId);
    try {
      await startBenchmarkRun({ runId, ...params });
    } catch (e) {
      useBenchmarkRunStore.getState().failStart(errorMessage(e, "Could not start the run."));
    }
  }, []);

  const cancel = useCallback(async () => {
    const runId = useBenchmarkRunStore.getState().runId;
    if (!runId) return;
    try {
      await cancelBenchmarkRun(runId);
    } catch (e) {
      toast.error("Could not cancel the run", errorMessage(e));
    }
  }, []);

  const phase: BenchmarkRunPhase = ownRun ? store.phase : "idle";
  return {
    phase,
    steps: ownRun ? store.steps : [],
    finished: ownRun ? store.finished : null,
    error: ownRun ? store.error : null,
    startedAt: ownRun ? store.startedAt : null,
    busyElsewhere: store.phase === "running" && !ownRun,
    start,
    cancel,
  };
}
