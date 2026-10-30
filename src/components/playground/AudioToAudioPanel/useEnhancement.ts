import { enhanceAudio } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechAudioInput, SpeechModel } from "../../../types";
import { buildEnhanceRequest } from "../../../utils/audioEnhance";
import { errorMessage } from "../../../utils/errorMessage";
import { failedSpeechResult } from "../../../utils/speech";

/**
 * Start an audio to audio job. Progress and the saved files come from the `PlaygroundRuntime` listeners.
 * A failed start is recorded here as the job's result.
 */
export function useEnhancement(): {
  enhance: (model: SpeechModel, audio: SpeechAudioInput) => void;
} {
  const startJob = useSpeechStore((s) => s.startJob);
  const finishJob = useSpeechStore((s) => s.finishJob);

  const enhance = (model: SpeechModel, audio: SpeechAudioInput) => {
    const request = buildEnhanceRequest(crypto.randomUUID(), model, audio);
    startJob({
      jobId: request.jobId,
      kind: model.kind,
      modelId: model.id,
      startedAt: Date.now(),
      phase: "loading",
    });
    enhanceAudio(request).catch((err: unknown) => {
      finishJob(
        failedSpeechResult(
          request.jobId,
          model.kind,
          errorMessage(err, "The audio could not be processed."),
        ),
      );
    });
  };

  return { enhance };
}
