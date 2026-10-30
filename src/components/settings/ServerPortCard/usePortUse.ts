import { useEffect, useState } from "react";
import { probePortUse } from "../../../services/serverPorts";
import type { ComputeTarget } from "../../../types";
import { PORT_FREE, type PortUse } from "../../../utils/serverPorts";

/** Wait this long after the last keystroke before probing a port. */
const PORT_PROBE_DELAY_MS = 400;

interface ProbeResult {
  port: number;
  target: ComputeTarget | null;
  use: PortUse;
}

/**
 * Checks what holds `port` for a field of `target` (null for the main port), a short while after it
 * changes. `port` is null when there is nothing to check. A result is only used for the port and
 * target it was taken for.
 */
export function usePortUse(
  port: number | null,
  target: ComputeTarget | null,
): { use: PortUse; checking: boolean } {
  const [result, setResult] = useState<ProbeResult | null>(null);

  useEffect(() => {
    if (port === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      probePortUse(port, target, controller.signal).then((use) => {
        if (!controller.signal.aborted) setResult({ port, target, use });
      });
    }, PORT_PROBE_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [port, target]);

  const answered = result !== null && result.port === port && result.target === target;
  return {
    use: answered ? result.use : PORT_FREE,
    checking: port !== null && !answered,
  };
}
