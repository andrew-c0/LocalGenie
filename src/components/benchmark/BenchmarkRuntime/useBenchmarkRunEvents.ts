import { useTauriEvent } from "../../../hooks";
import { useBenchmarkRunStore } from "../../../stores/benchmarkRunStore";
import type { BenchmarkFinishedEvent, BenchmarkProgressEvent } from "../../../types";
import { toast } from "../../../utils/toast";

const PROGRESS_EVENT = "benchmark-progress";
const FINISHED_EVENT = "benchmark-finished";

/** The toast for a run that ended, by how it ended. */
function toastFinished(event: BenchmarkFinishedEvent) {
  if (event.status === "completed") {
    toast.success("Run finished");
  } else if (event.status === "cancelled") {
    toast.info("Run cancelled", "Finished steps are saved.");
  } else {
    toast.error("Run failed", event.error ?? undefined);
  }
}

/**
 * Subscribes to the benchmark run events for the app's lifetime. Events for a run other than the one in
 * progress are ignored, so a finished run's late events do nothing.
 */
export function useBenchmarkRunEvents() {
  useTauriEvent<BenchmarkProgressEvent>(PROGRESS_EVENT, (event) => {
    const store = useBenchmarkRunStore.getState();
    if (event.runId === store.runId) store.addStep(event);
  });

  useTauriEvent<BenchmarkFinishedEvent>(FINISHED_EVENT, (event) => {
    const store = useBenchmarkRunStore.getState();
    if (event.runId !== store.runId) return;
    store.finish(event);
    toastFinished(event);
  });
}
