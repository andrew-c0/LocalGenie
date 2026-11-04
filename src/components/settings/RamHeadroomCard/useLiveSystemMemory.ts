import { useEffect, useState } from "react";
import type { SystemMemoryInfo } from "../../../services/system";
import { getSystemMemory } from "../../../services/system";

/** How often the memory figures refresh while the window is visible. */
const SYSTEM_MEMORY_POLL_MS = 5_000;

/**
 * Total and available system RAM, kept live: read on mount, then every `intervalMs` while the document
 * is visible. Null until the first read finishes, and stays null when reads fail. For a single read
 * without polling, use `hooks/useSystemMemory`.
 */
export function useLiveSystemMemory(
  intervalMs: number = SYSTEM_MEMORY_POLL_MS,
): SystemMemoryInfo | null {
  const [memory, setMemory] = useState<SystemMemoryInfo | null>(null);

  useEffect(() => {
    let mounted = true;
    const read = () => {
      getSystemMemory()
        .then((next) => {
          if (mounted) setMemory(next);
        })
        .catch((err: unknown) => console.warn("[settings] System memory unavailable:", err));
    };

    read();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") read();
    }, intervalMs);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return memory;
}
