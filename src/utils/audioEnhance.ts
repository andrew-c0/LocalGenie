import type {
  EnhanceKind,
  SpeechAudioInput,
  SpeechEnhanceRequest,
  SpeechJob,
  SpeechKind,
  SpeechModel,
} from "../types";

/** The task the Audio to audio tab starts on. */
export const DEFAULT_ENHANCE_KIND: EnhanceKind = "denoise";

/** True for the kinds the Audio to audio tab runs. Speech to text and text to speech are not. */
export function isEnhanceKind(kind: SpeechKind): kind is EnhanceKind {
  return kind === "denoise" || kind === "separate";
}

/** The running job when it is an audio to audio job, else null. Speech to text and speech synthesis jobs are left out. */
export function enhanceJobOf(job: SpeechJob | null): SpeechJob | null {
  return job && isEnhanceKind(job.kind) ? job : null;
}

/** The request for `playground_enhance_audio`. The model decides the task; the file is sent as it was chosen. */
export function buildEnhanceRequest(
  jobId: string,
  model: SpeechModel,
  audio: SpeechAudioInput,
): SpeechEnhanceRequest {
  return { jobId, modelId: model.id, audioPath: audio.audioPath };
}
