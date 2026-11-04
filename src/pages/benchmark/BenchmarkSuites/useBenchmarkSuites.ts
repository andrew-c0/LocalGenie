import { useCallback, useEffect, useState } from "react";
import { deleteBenchmarkSuite, listBenchmarkSuites } from "../../../services/benchmark";
import type { BenchmarkSuite } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/** Suites sorted by name, the same order the backend returns. */
function byName(a: BenchmarkSuite, b: BenchmarkSuite): number {
  return a.name.localeCompare(b.name);
}

/**
 * Loads the suites. `upsert` puts a saved suite into the list without a reload; `remove` deletes one,
 * toasts the outcome and reloads.
 */
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

  /** Resolves true when the suite is gone. A failure is toasted and resolves false. */
  const remove = useCallback(
    async (suite: BenchmarkSuite): Promise<boolean> => {
      try {
        await deleteBenchmarkSuite(suite.id);
      } catch (e) {
        toast.error("Could not delete the suite", errorMessage(e));
        return false;
      }
      toast.success("Suite deleted", suite.name);
      void reload();
      return true;
    },
    [reload],
  );

  return { suites, error, reload, upsert, remove };
}
