import { useCallback, useEffect, useState } from "react";
import { listBenchmarkSuites } from "../../../services/benchmark";
import type { BenchmarkSuite } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";

/** Suites sorted by name, the same order the backend returns. */
function byName(a: BenchmarkSuite, b: BenchmarkSuite): number {
  return a.name.localeCompare(b.name);
}

/** Loads the suites and keeps the list in step with saves and deletes. */
export function useBenchmarkSuites() {
  const [suites, setSuites] = useState<BenchmarkSuite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSuites(await listBenchmarkSuites());
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Could not load the suites."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upsert = useCallback((saved: BenchmarkSuite) => {
    setSuites((list) => [...(list ?? []).filter((s) => s.id !== saved.id), saved].sort(byName));
  }, []);

  const remove = useCallback((id: string) => {
    setSuites((list) => (list ?? []).filter((s) => s.id !== id));
  }, []);

  return { suites, error, reload, upsert, remove };
}
