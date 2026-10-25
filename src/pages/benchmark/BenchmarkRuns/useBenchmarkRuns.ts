import { useCallback, useEffect, useState } from "react";
import { listBenchmarkRuns } from "../../../services/benchmark";
import type { BenchmarkRunSummary } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";

/** Every benchmark run, newest first. Reloads on demand. */
export function useBenchmarkRuns() {
  const [runs, setRuns] = useState<BenchmarkRunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRuns(await listBenchmarkRuns());
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Could not load the runs."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { runs, error, reload };
}
