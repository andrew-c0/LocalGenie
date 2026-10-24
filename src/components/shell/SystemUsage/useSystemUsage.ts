import { useEffect, useState } from "react";
import { getSystemUsage, type SystemUsage } from "../../../services/system";

/** Seconds between samples. The native probe waits one second per reading. */
export const USAGE_SAMPLE_SECONDS = 1;

/** Samples kept for the chart: one minute at one sample per second. */
export const USAGE_HISTORY_LENGTH = 60;

const RETRY_DELAY_MS = 2000;

/**
 * Poll CPU, GPU and NPU utilization while the component is mounted. Each call takes about a second,
 * so the next call starts as soon as the last one returns. Returns the latest samples, oldest first.
 */
export function useSystemUsage(port: number): SystemUsage[] {
  const [samples, setSamples] = useState<SystemUsage[]>([]);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      while (active) {
        try {
          const usage = await getSystemUsage(port);
          if (active) setSamples((prev) => [...prev, usage].slice(-USAGE_HISTORY_LENGTH));
        } catch (err) {
          console.warn("[system] usage sample failed", err);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    };

    void poll();
    return () => {
      active = false;
    };
  }, [port]);

  return samples;
}
