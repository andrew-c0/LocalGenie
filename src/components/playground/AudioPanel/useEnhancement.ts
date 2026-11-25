import { enhanceAudio } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechAudioInput, SpeechModel } from "../../../types";
import { buildEnhanceRequest } from "../../../utils/audioEnhance";
import { useSpeechStartFailure } from "./useSpeechStartFailure";

/**
 * Start a clean up or split job. Progress and the saved files come from the `PlaygroundRuntime` listeners.
 * A failed start is reported by `useSpeechStartFailure`.
 */
export function useEnhancement(): {
  enhance: (model: SpeechModel, audio: SpeechAudioInput) => void;
} {
  const startJob = useSpeechStore((s) => s.startJob);
  const startFailed = useSpeechStartFailure();

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
      startFailed(request.jobId, model.kind, err, "The audio could not be processed.");
    });
  };

  return { enhance };
}
