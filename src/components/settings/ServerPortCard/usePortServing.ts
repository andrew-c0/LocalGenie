import { useEffect, useState } from "react";
import * as geniex from "../../../services/geniex";

/** Wait this long after the last keystroke before probing a port. */
const PORT_PROBE_DELAY_MS = 400;

interface ProbeResult {
  port: number;
  serving: boolean;
}

/**
 * Checks whether another program answers on `port`, a short while after it changes. `port` is null
 * when there is nothing to check. Results are kept per port, so a result is only used for the port
 * it was taken for.
 */
export function usePortServing(port: number | null): { serving: boolean; checking: boolean } {
  const [result, setResult] = useState<ProbeResult | null>(null);

  useEffect(() => {
    if (port === null) return;
    const controller = new AbortController();
    const record = (serving: boolean) => {
      if (!controller.signal.aborted) setResult({ port, serving });
    };
    const timer = setTimeout(() => {
      geniex.isPortServing(port, controller.signal).then(record, () => record(false));
    }, PORT_PROBE_DELAY_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [port]);

  const answeredForPort = result !== null && result.port === port;
  return {
    serving: answeredForPort && result.serving,
    checking: port !== null && !answeredForPort,
  };
}
