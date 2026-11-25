import { synthesizeSpeech } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechForm, SpeechModel } from "../../../types";
import { buildSynthesizeRequest } from "../../../utils/speech";
import { useSpeechStartFailure } from "./useSpeechStartFailure";

/**
 * Start a speech synthesis. Progress and the saved file come from the `PlaygroundRuntime` listeners.
 * A failed start is reported by `useSpeechStartFailure`.
 */
export function useSynthesis(): {
  synthesize: (
    model: SpeechModel,
    form: SpeechForm,
    voiceId: number,
    referencePath?: string | null,
  ) => void;
} {
  const startJob = useSpeechStore((s) => s.startJob);
  const startFailed = useSpeechStartFailure();

  const synthesize = (
    model: SpeechModel,
    form: SpeechForm,
    voiceId: number,
    referencePath: string | null = null,
  ) => {
    const request = buildSynthesizeRequest(
      crypto.randomUUID(),
      model,
      form,
      voiceId,
      referencePath,
    );
    startJob({
      jobId: request.jobId,
      kind: "tts",
      modelId: model.id,
      startedAt: Date.now(),
      phase: "loading",
    });
    synthesizeSpeech(request).catch((err: unknown) => {
      startFailed(request.jobId, "tts", err, "The speech could not start.");
    });
  };

  return { synthesize };
}
