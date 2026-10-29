import { cancelSpeech } from "../../../services/playground";
import { useSpeechStore } from "../../../stores/speechStore";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

/** Stop the running speech job. Progress and the outcome come from the `PlaygroundRuntime` listeners. */
export function useSpeechJobCancel(): () => void {
  return () => {
    const job = useSpeechStore.getState().job;
    if (!job) return;
    cancelSpeech(job.jobId).catch((err: unknown) => {
      toast.error("Could not cancel the job", errorMessage(err));
    });
  };
}
