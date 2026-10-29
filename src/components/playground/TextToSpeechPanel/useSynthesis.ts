import { synthesizeSpeech } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechForm, SpeechModel } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { buildSynthesizeRequest, failedSpeechResult } from "../../../utils/speech";

/**
 * Start a speech synthesis. Progress and the saved file come from the `PlaygroundRuntime` listeners.
 * A failed start is recorded here as the job's result.
 */
export function useSynthesis(): {
  synthesize: (model: SpeechModel, form: SpeechForm, voiceId: number) => void;
} {
  const startJob = useSpeechStore((s) => s.startJob);
  const finishJob = useSpeechStore((s) => s.finishJob);

  const synthesize = (model: SpeechModel, form: SpeechForm, voiceId: number) => {
    const request = buildSynthesizeRequest(crypto.randomUUID(), model, form, voiceId);
    startJob({
      jobId: request.jobId,
      kind: "tts",
      modelId: model.id,
      startedAt: Date.now(),
      phase: "loading",
    });
    synthesizeSpeech(request).catch((err: unknown) => {
      finishJob(
        failedSpeechResult(request.jobId, "tts", errorMessage(err, "The speech could not start.")),
      );
    });
  };

  return { synthesize };
}
