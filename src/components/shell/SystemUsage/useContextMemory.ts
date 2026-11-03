import { useEffect, useState } from "react";
import { getContextMemory } from "../../../services/models";

interface Settled {
  key: string;
  bytes: number | null;
}

/**
 * KV-cache bytes reserved for a model's context window, read once per model and window. Returns
 * null while the value is unknown or when it could not be computed. A result for another model or
 * window is never returned.
 */
export function useContextMemory(
  modelName: string | null,
  nCtx: number | null,
  keepPrevious = false,
): number | null {
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!modelName || nCtx === null) return;
    const key = `${modelName}|${nCtx}`;
    let active = true;
    getContextMemory(modelName, nCtx)
      .then((bytes) => {
        if (active) setSettled({ key, bytes });
      })
      .catch((err: unknown) => {
        console.warn("[system] context memory unavailable", err);
        if (active) setSettled({ key, bytes: null });
      });
    return () => {
      active = false;
    };
  }, [modelName, nCtx]);

  const current = modelName && nCtx !== null ? `${modelName}|${nCtx}` : null;
  if (settled && settled.key === current) return settled.bytes;
  // With `keepPrevious`, the last figure of the same model stays until the new one arrives, so a
  // value edited step by step does not flash back to a fallback in between.
  if (keepPrevious && settled && modelName && settled.key.startsWith(`${modelName}|`)) {
    return settled.bytes;
  }
  return null;
}
