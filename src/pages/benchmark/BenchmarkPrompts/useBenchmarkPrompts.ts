import { useCallback, useEffect, useState } from "react";
import { listBenchmarkPrompts } from "../../../services/benchmark";
import type { BenchmarkPrompt } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";

/** Prompts sorted by name, the same order the backend returns. */
function byName(a: BenchmarkPrompt, b: BenchmarkPrompt): number {
  return a.name.localeCompare(b.name);
}

/** Loads the prompt library and keeps the list in step with saves and deletes. */
export function useBenchmarkPrompts() {
  const [prompts, setPrompts] = useState<BenchmarkPrompt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setPrompts(await listBenchmarkPrompts());
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Could not load the prompt library."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upsert = useCallback((saved: BenchmarkPrompt) => {
    setPrompts((list) => [...(list ?? []).filter((p) => p.id !== saved.id), saved].sort(byName));
  }, []);

  const remove = useCallback((id: string) => {
    setPrompts((list) => (list ?? []).filter((p) => p.id !== id));
  }, []);

  return { prompts, error, reload, upsert, remove };
}
