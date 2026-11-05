import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useSpeechStore } from "../../../stores/speechStore";
import { AUDIO_TASK_PARAM, audioTaskFromParam } from "../../../utils/audioTask";

/**
 * Opens the Audio tool on the task its URL names (`?task=`, set by the redirects from the old speech pages). With no
 * task in the URL, the task kept in the store stays.
 */
export function useAudioEntryTask(): void {
  const [params] = useSearchParams();
  const setAudioTask = useSpeechStore((s) => s.setAudioTask);
  const requested = audioTaskFromParam(params.get(AUDIO_TASK_PARAM));

  useEffect(() => {
    if (requested !== null) setAudioTask(requested);
  }, [requested, setAudioTask]);
}
