import type { RuntimeInstallStage } from "../types";

/**
 * What a backend install stage means for its drawer entry: a byte-counted download, the import-like
 * steps after it, or the end (the invoke result decides the status then).
 */
export type InstallStep = "download" | "import" | "end";

export function installStepOf(stage: RuntimeInstallStage): InstallStep {
  if (stage === "checking" || stage === "downloading") return "download";
  if (stage === "verifying" || stage === "extracting" || stage === "installing") return "import";
  return "end";
}

/** Weight of the newest interval in the running speed. */
const NEW_SAMPLE_WEIGHT = 0.3;

export interface SpeedSample {
  received: number;
  /** Time of the sample, in milliseconds. */
  at: number;
  /** Smoothed bytes per second at this sample. */
  speed: number;
}

/**
 * Smoothed bytes per second from the previous sample. A first sample, or one whose byte count went
 * backwards (a new attempt), starts at speed 0. A sample with no elapsed time keeps the previous speed.
 */
export function sampleSpeed(
  previous: SpeedSample | undefined,
  received: number,
  at: number,
): SpeedSample {
  if (!previous || received < previous.received) return { received, at, speed: 0 };
  const elapsedMs = at - previous.at;
  if (elapsedMs <= 0) return { ...previous, received };
  const instant = ((received - previous.received) * 1000) / elapsedMs;
  const speed =
    previous.speed > 0
      ? NEW_SAMPLE_WEIGHT * instant + (1 - NEW_SAMPLE_WEIGHT) * previous.speed
      : instant;
  return { received, at, speed };
}
