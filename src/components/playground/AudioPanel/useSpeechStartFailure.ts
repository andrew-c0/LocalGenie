import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechKind } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { failedSpeechResult } from "../../../utils/speech";
import { speechFailedTitle } from "../../../utils/speechText";
import { toast } from "../../../utils/toast";

/**
 * Handles a speech job that could not start. The job's result is recorded as failed, and the reason is raised as the
 * same toast a job that fails while running gives, so the Audio stage does not need to show it.
 */
export function useSpeechStartFailure(): (
  jobId: string,
  kind: SpeechKind,
  err: unknown,
  fallback: string,
) => void {
  const finishJob = useSpeechStore((s) => s.finishJob);

  return (jobId, kind, err, fallback) => {
    const message = errorMessage(err, fallback);
    finishJob(failedSpeechResult(jobId, kind, message));
    toast.error(speechFailedTitle(kind), message);
  };
}
