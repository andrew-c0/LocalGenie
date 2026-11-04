import { useCallback, useEffect, useState } from "react";
import { deleteBenchmarkPrompt, listBenchmarkPrompts } from "../../../services/benchmark";
import type { BenchmarkPrompt } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/** Prompts sorted by name, the same order the backend returns. */
function byName(a: BenchmarkPrompt, b: BenchmarkPrompt): number {
  return a.name.localeCompare(b.name);
}

/**
 * Loads the prompt library. `upsert` puts a saved prompt into the list without a reload; `remove`
 * deletes one, toasts the outcome and reloads.
 */
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

  /** Resolves true when the prompt is gone. A refusal (a suite still uses it) is toasted and resolves false. */
  const remove = useCallback(
    async (prompt: BenchmarkPrompt): Promise<boolean> => {
      try {
        await deleteBenchmarkPrompt(prompt.id);
      } catch (e) {
        toast.error("Could not delete the prompt", errorMessage(e));
        return false;
      }
      toast.success("Prompt deleted", prompt.name);
      void reload();
      return true;
    },
    [reload],
  );

  return { prompts, error, reload, upsert, remove };
}
