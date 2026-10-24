import { useEffect, useState } from "react";
import { loadModelCapabilities } from "../../services/models";
import type { CapabilityEntry } from "../../types";

/**
 * Stored scan results for the active model. Null until they load for this model, and for no model.
 * A failed load gives an empty list, so nothing is confirmed. A result for another model is never
 * returned.
 */
export function useActiveModelEntries(modelName: string | null): CapabilityEntry[] | null {
  const [loaded, setLoaded] = useState<{ model: string; entries: CapabilityEntry[] } | null>(null);

  useEffect(() => {
    if (!modelName) return;
    let current = true;
    loadModelCapabilities(modelName)
      .catch((): CapabilityEntry[] => [])
      .then((entries) => {
        if (current) setLoaded({ model: modelName, entries });
      });
    return () => {
      current = false;
    };
  }, [modelName]);

  return modelName && loaded?.model === modelName ? loaded.entries : null;
}
