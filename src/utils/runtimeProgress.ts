import type { RuntimeInstallProgress, RuntimeInstallStage } from "../types";
import { formatBytes } from "./format";

const STAGE_LABELS: Record<RuntimeInstallStage, string> = {
  checking: "Checking release",
  downloading: "Downloading",
  verifying: "Verifying",
  extracting: "Extracting",
  done: "Done",
  error: "Failed",
};

/** Percent of the archive received, or null when the total is unknown (the bar is then indeterminate). */
export function runtimeProgressPercent(
  progress: Pick<RuntimeInstallProgress, "received" | "total">,
): number | null {
  if (progress.total <= 0) return null;
  return Math.min(100, Math.round((progress.received / progress.total) * 100));
}

/** Stage label with the byte counts while downloading, e.g. "Downloading 12.0 MB of 63.0 MB". */
export function runtimeProgressLabel(progress: RuntimeInstallProgress): string {
  const label = STAGE_LABELS[progress.stage];
  if (progress.stage !== "downloading" || progress.total <= 0) return label;
  return `${label} ${formatBytes(progress.received)} of ${formatBytes(progress.total)}`;
}
