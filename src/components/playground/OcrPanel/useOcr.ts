import * as playground from "../../../services/playground";
import { useModelStore } from "../../../stores/modelStore";
import { useOcrStore } from "../../../stores/ocrStore";
import type { OcrMode, OcrModel } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { buildOcrRequest, newOcrJobId } from "../../../utils/ocr";
import { OCR_FAILED_MESSAGE } from "../../../utils/ocrText";
import { toast } from "../../../utils/toast";

/**
 * Start and cancel an OCR job. The result comes from the `PlaygroundRuntime` listeners. A failed
 * start is recorded as the job's result.
 */
export function useOcr() {
  const startJob = useOcrStore((s) => s.startJob);
  const finishJob = useOcrStore((s) => s.finishJob);
  const jobId = useOcrStore((s) => s.job?.jobId ?? null);

  const run = (model: OcrModel, imagePath: string, inputName: string, mode: OcrMode) => {
    const request = buildOcrRequest(
      newOcrJobId(),
      model,
      imagePath,
      mode,
      useOcrStore.getState().settings,
      useModelStore.getState().serverPort,
    );
    startJob({ jobId: request.jobId, modelId: model.id, startedAt: Date.now() });
    playground.runOcr(request).catch((err: unknown) => {
      finishJob({
        jobId: request.jobId,
        status: "error",
        text: null,
        error: errorMessage(err, OCR_FAILED_MESSAGE),
        seconds: null,
        inputName,
      });
    });
  };

  const cancel = () => {
    if (!jobId) return;
    playground.cancelOcr(jobId).catch((err: unknown) => {
      toast.error("Could not cancel", errorMessage(err));
    });
  };

  return { run, cancel };
}
