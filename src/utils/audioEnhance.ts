import type {
  EnhanceKind,
  SpeechAudioInput,
  SpeechEnhanceRequest,
  SpeechKind,
  SpeechModel,
} from "../types";

/** The clean up or split task the Audio tool starts on. */
export const DEFAULT_ENHANCE_KIND: EnhanceKind = "denoise";

/** True for the kinds the clean up and split task runs. Speech to text and text to speech are not. */
export function isEnhanceKind(kind: SpeechKind): kind is EnhanceKind {
  return kind === "denoise" || kind === "separate";
}

/** The request for `playground_enhance_audio`. The model decides the task; the file is sent as it was chosen. */
export function buildEnhanceRequest(
  jobId: string,
  model: SpeechModel,
  audio: SpeechAudioInput,
): SpeechEnhanceRequest {
  return { jobId, modelId: model.id, audioPath: audio.audioPath };
}
