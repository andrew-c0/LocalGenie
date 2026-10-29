import { transcribeSpeech } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechAudioInput, SpeechModel } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { buildTranscribeRequest, failedSpeechResult } from "../../../utils/speech";

/**
 * Start a transcription. Progress and the transcript come from the `PlaygroundRuntime` listeners. A
 * failed start is recorded here as the job's result.
 */
export function useTranscription(): {
  transcribe: (model: SpeechModel, audio: SpeechAudioInput) => void;
} {
  const startJob = useSpeechStore((s) => s.startJob);
  const finishJob = useSpeechStore((s) => s.finishJob);

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
      finishJob(
        failedSpeechResult(
          request.jobId,
          "stt",
          errorMessage(err, "The transcription could not start."),
        ),
      );
    });
  };

  return { transcribe };
}
