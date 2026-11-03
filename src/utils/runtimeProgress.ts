import type { RuntimeInstallStage } from "../types";

const STAGE_LABELS: Record<RuntimeInstallStage, string> = {
  checking: "Checking release",
  downloading: "Downloading",
  verifying: "Verifying",
  extracting: "Extracting",
  installing: "Installing…",
  done: "Done",
  error: "Failed",
};

/** The stage name shown for an install step, e.g. "Extracting". */
export function runtimeStageLabel(stage: RuntimeInstallStage): string {
  return STAGE_LABELS[stage];
}
