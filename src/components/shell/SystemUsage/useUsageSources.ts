import { useModelStore } from "../../../stores/modelStore";
import { useOcrStore } from "../../../stores/ocrStore";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { useSpeechStore } from "../../../stores/speechStore";
import type { ComputeTarget } from "../../../types";
import { usageTargets } from "../../../utils/usageTargets";

/** True while a GenieX model is loaded on the server. */
export function useModelLoaded(): boolean {
  return useModelStore((s) => s.serverStatus.models.length > 0);
}

/** True while a Playground job runs: text to image, image to image, upscaling, speech or OCR. */
export function usePlaygroundJobRunning(): boolean {
  const imageRunning = usePlaygroundStore((s) => s.job !== null);
  const speechRunning = useSpeechStore((s) => s.job !== null);
  const ocrRunning = useOcrStore((s) => s.job !== null);
  return imageRunning || speechRunning || ocrRunning;
}

/**
 * Targets the usage chart plots: the loaded model's target (when one is loaded and no OCR job runs)
 * and every device the running Playground job uses. The loaded model's target falls back to the chosen
 * compute target when the model was not loaded by this app.
 */
export function useUsageTargets(): ComputeTarget[] {
  const loadedCompute = useModelStore((s) =>
    s.serverStatus.models.length > 0 ? (s.loadedCompute ?? s.compute) : null,
  );
  const imageJob = usePlaygroundStore((s) => s.job);
  const devices = usePlaygroundStore((s) => s.devices);
  const speechJob = useSpeechStore((s) => s.job);
  const ocrJob = useOcrStore((s) => s.job);
  return usageTargets({ loadedCompute, imageJob, speechJob, ocrJob, devices });
}
