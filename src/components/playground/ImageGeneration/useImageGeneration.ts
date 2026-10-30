import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { ImageForm, ImageGenerateRequest } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/** A new id for an image job. The request and the job share it. */
export function newImageJobId(): string {
  return `img-${Date.now()}`;
}

/**
 * Start and cancel an image generation, for text to image and image to image alike. Progress and the
 * result come from the `PlaygroundRuntime` listeners. A failed start is recorded here as the job's result.
 */
export function useImageGeneration() {
  const startJob = usePlaygroundStore((s) => s.startJob);
  const finishJob = usePlaygroundStore((s) => s.finishJob);

  /**
   * Start the job a request describes. `form` gives the compute choice; `inputPath` is the picture an
   * edit works on, or null for text to image.
   */
  const generate = (request: ImageGenerateRequest, form: ImageForm, inputPath: string | null) => {
    startJob({
      jobId: request.jobId,
      kind: "generate",
      modelId: request.modelId,
      device: form.device,
      inputPath,
      startedAt: Date.now(),
      phase: "loading",
      step: 0,
      steps: request.steps,
      secondsPerStep: null,
    });
    playground.generateImage(request).catch((err: unknown) => {
      finishJob({
        jobId: request.jobId,
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
