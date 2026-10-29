import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { ImageForm, ImageModel } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { buildImageRequest } from "../../../utils/playground";
import { toast } from "../../../utils/toast";

/**
 * Start and cancel an image generation. Progress and the result come from the `PlaygroundRuntime`
 * listeners. A failed start is recorded here as the job's result.
 */
export function useImageGeneration() {
  const startJob = usePlaygroundStore((s) => s.startJob);
  const finishJob = usePlaygroundStore((s) => s.finishJob);

  const generate = (model: ImageModel, form: ImageForm) => {
    const jobId = `img-${Date.now()}`;
    startJob({
      jobId,
      modelId: model.id,
      device: form.device,
      startedAt: Date.now(),
      phase: "loading",
      step: 0,
      steps: form.steps,
      secondsPerStep: null,
    });
    playground.generateImage(buildImageRequest(jobId, model, form)).catch((err: unknown) => {
      finishJob({
        jobId,
        status: "error",
        path: null,
        error: errorMessage(err, "The image could not be generated."),
        seed: null,
        seconds: null,
      });
    });
  };

  const cancel = () => {
    const job = usePlaygroundStore.getState().job;
    if (!job) return;
    playground.cancelImage(job.jobId).catch((err: unknown) => {
      toast.error("Could not cancel the image", errorMessage(err));
    });
  };

  return { generate, cancel };
}
