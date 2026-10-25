import { useCallback, useEffect, useRef, useState } from "react";
import { cancelBenchmarkRun, startBenchmarkRun } from "../../../services/benchmark";
import { listenEvent } from "../../../services/events";
import type {
  BenchmarkFinishedEvent,
  BenchmarkProgressEvent,
  BenchmarkRunRequest,
} from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

export type RunPhase = "idle" | "running" | "finished";

/** Replace the event for the same pass and step, or add it at the end. */
function withStep(list: BenchmarkProgressEvent[], event: BenchmarkProgressEvent) {
  const index = list.findIndex((s) => s.pass === event.pass && s.stepIndex === event.stepIndex);
  if (index < 0) return [...list, event];
  return list.map((s, i) => (i === index ? event : s));
}

/**
 * The run started from the Run panel: its live steps and how it ended. Events for other runs are
 * ignored. `onFinished` runs once the run ends, so the counters can be read again.
 */
export function useSuiteRun(onFinished: () => void) {
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [steps, setSteps] = useState<BenchmarkProgressEvent[]>([]);
  const [finished, setFinished] = useState<BenchmarkFinishedEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const runIdRef = useRef<string | null>(null);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let disposed = false;

    const subscribe = async () => {
      const stopProgress = await listenEvent<BenchmarkProgressEvent>(
        "benchmark-progress",
        (event) => {
          if (event.runId !== runIdRef.current) return;
          setSteps((list) => withStep(list, event));
        },
      );
      const stopFinished = await listenEvent<BenchmarkFinishedEvent>(
        "benchmark-finished",
        (event) => {
          if (event.runId !== runIdRef.current) return;
          runIdRef.current = null;
          setFinished(event);
          setPhase("finished");
          if (event.status === "completed") {
            toast.success("Run finished");
          } else if (event.status === "cancelled") {
            toast.info("Run cancelled", "Finished steps are saved.");
          } else {
            toast.error("Run failed", event.error ?? undefined);
          }
          onFinishedRef.current();
        },
      );
      if (disposed) {
        stopProgress();
        stopFinished();
      } else {
        unlisteners.push(stopProgress, stopFinished);
      }
    };

    void subscribe();
    return () => {
      disposed = true;
      for (const stop of unlisteners) stop();
    };
  }, []);

  const start = useCallback(async (params: Omit<BenchmarkRunRequest, "runId">) => {
    const runId = crypto.randomUUID();
    runIdRef.current = runId;
    setSteps([]);
    setFinished(null);
    setError(null);
    setStartedAt(Date.now());
    setPhase("running");
    try {
      await startBenchmarkRun({ runId, ...params });
    } catch (e) {
      runIdRef.current = null;
      setPhase("idle");
      setError(errorMessage(e, "Could not start the run."));
    }
  }, []);

  const cancel = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    try {
      await cancelBenchmarkRun(runId);
    } catch (e) {
      toast.error("Could not cancel the run", errorMessage(e));
    }
  }, []);

  return { phase, steps, finished, error, startedAt, start, cancel };
}
