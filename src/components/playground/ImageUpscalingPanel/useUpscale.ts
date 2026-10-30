import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { UpscaleRequest } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { DEVICE_AUTO } from "../../../utils/playground";
import { UPSCALE_FAILED_MESSAGE } from "../../../utils/upscaleText";

/**
 * Start an upscale job. Progress and the result come from the `PlaygroundRuntime` listeners, and
 * cancel is the image cancel (`useImageGeneration`). A failed start is recorded as the job's result.
 */
export function useUpscale() {
  const startJob = usePlaygroundStore((s) => s.startJob);
  const finishJob = usePlaygroundStore((s) => s.finishJob);

  return (request: UpscaleRequest) => {
    startJob({
      jobId: request.jobId,
      kind: "upscale",
      modelId: request.modelId,
      device: DEVICE_AUTO,
      inputPath: request.inputPath,
      startedAt: Date.now(),
      phase: "loading",
      step: 0,
      steps: 0,
      secondsPerStep: null,
    });
    playground.upscaleImage(request).catch((err: unknown) => {
      finishJob({
        jobId: request.jobId,
        status: "error",
        path: null,
        error: errorMessage(err, UPSCALE_FAILED_MESSAGE),
        seed: null,
        seconds: null,
      });
    });
  };
}
