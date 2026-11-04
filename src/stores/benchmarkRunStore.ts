import { create } from "zustand";
import type { BenchmarkFinishedEvent, BenchmarkProgressEvent } from "../types";

/** idle: no run yet; running: a run is in progress; finished: the last run has ended. */
export type BenchmarkRunPhase = "idle" | "running" | "finished";

interface BenchmarkRunState {
  phase: BenchmarkRunPhase;
  /** The suite of the current or last run. A suite's page shows a run only when it is that suite's. */
  suiteId: string | null;
  /** Id of the run in progress, or null. Events for any other run are ignored. */
  runId: string | null;
  steps: BenchmarkProgressEvent[];
  finished: BenchmarkFinishedEvent | null;
  /** Why the last start was refused. */
  error: string | null;
  startedAt: number | null;
  /** Marks a run as started before its start request is sent, so its first events are not missed. */
  begin: (runId: string, suiteId: string) => void;
  /** The start request was refused. */
  failStart: (message: string) => void;
  addStep: (event: BenchmarkProgressEvent) => void;
  finish: (event: BenchmarkFinishedEvent) => void;
}

/** Replace the event for the same pass and step, or add it at the end. */
function withStep(list: BenchmarkProgressEvent[], event: BenchmarkProgressEvent) {
  const index = list.findIndex((s) => s.pass === event.pass && s.stepIndex === event.stepIndex);
  if (index < 0) return [...list, event];
  return list.map((s, i) => (i === index ? event : s));
}

/**
 * The benchmark run started from the Run pages. The run lives in the backend and its events reach this
 * store through `BenchmarkRuntime`, which is mounted by the main layout. So a run keeps its progress and
 * its end while the user is on another page. Events are filtered by run id in that listener.
 */
export const useBenchmarkRunStore = create<BenchmarkRunState>()((set) => ({
  phase: "idle",
  suiteId: null,
  runId: null,
  steps: [],
  finished: null,
  error: null,
  startedAt: null,
  begin: (runId, suiteId) =>
    set({
      phase: "running",
      suiteId,
      runId,
      steps: [],
      finished: null,
      error: null,
      startedAt: Date.now(),
    }),
  failStart: (message) => set({ phase: "idle", runId: null, error: message }),
  addStep: (event) => set((state) => ({ steps: withStep(state.steps, event) })),
  finish: (event) => set({ phase: "finished", runId: null, finished: event }),
}));
