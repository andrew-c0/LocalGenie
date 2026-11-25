import { transcribeSpeech } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechAudioInput, SpeechModel } from "../../../types";
import { buildTranscribeRequest } from "../../../utils/speech";
import { useSpeechStartFailure } from "./useSpeechStartFailure";

/**
 * Start a transcription. Progress and the transcript come from the `PlaygroundRuntime` listeners. A
 * failed start is reported by `useSpeechStartFailure`.
 */
export function useTranscription(): {
  transcribe: (model: SpeechModel, audio: SpeechAudioInput) => void;
} {
  const startJob = useSpeechStore((s) => s.startJob);
  const startFailed = useSpeechStartFailure();

  const transcribe = (model: SpeechModel, audio: SpeechAudioInput) => {
    const request = buildTranscribeRequest(crypto.randomUUID(), model, audio);
    startJob({
      jobId: request.jobId,
      kind: "stt",
      modelId: model.id,
      startedAt: Date.now(),
      phase: "loading",
    });
    transcribeSpeech(request).catch((err: unknown) => {
      startFailed(request.jobId, "stt", err, "The transcription could not start.");
    });
  };

  return { transcribe };
}
