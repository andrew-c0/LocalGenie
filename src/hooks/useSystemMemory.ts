import { useEffect, useState } from "react";
import type { SystemMemoryInfo } from "../services/system";
import { getSystemMemory } from "../services/system";

/**
 * System memory snapshot, read once on mount. Null until the read finishes, and stays null when
 * the read fails. Pages and lists that show RAM fit read it here, once, and pass the figures down.
 */
export function useSystemMemory(): SystemMemoryInfo | null {
  const [systemMemory, setSystemMemory] = useState<SystemMemoryInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSystemMemory()
      .then((mem) => !cancelled && setSystemMemory(mem))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return systemMemory;
}
