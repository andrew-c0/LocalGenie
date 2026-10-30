import type {
  ImageJob,
  ImageJobKind,
  ImageResult,
  ImageSize,
  UpscaleModel,
  UpscaleRequest,
} from "../types";
import { NO_INPUT_REASON } from "./imageToImageText";
import {
  type GenerationProgressState,
  type RuntimeStatus,
  runtimeBlockedReason,
  SD_CPP_NAME,
} from "./playground";
import {
  oversizedInputMessage,
  UPSCALE_DOWNLOAD_FIRST_REASON,
  UPSCALE_JOB_RUNNING_REASON,
  UPSCALE_NO_MODEL_REASON,
  UPSCALE_PHASE_LABELS,
  upscalePartLabel,
} from "./upscaleText";

/** Every upscaling model makes the picture this many times longer on each side. */
export const UPSCALE_FACTOR = 4;

/** The backend refuses pictures with a longer side than this. */
export const UPSCALE_INPUT_MAX_SIDE = 1024;

/** The model a selection falls back to: the first downloaded one, else the first listed. */
export function defaultUpscaleModel(models: UpscaleModel[]): UpscaleModel | null {
  return models.find((model) => model.downloaded) ?? models[0] ?? null;
}

/** True when the picture's longest side is over the limit the backend accepts. */
export function isOversizedInput(size: ImageSize): boolean {
  return Math.max(size.width, size.height) > UPSCALE_INPUT_MAX_SIDE;
}

/** The warning for a picture that is too large, or null when its size is unknown or fine. */
export function oversizedInputWarning(size: ImageSize | null): string | null {
  if (!size || !isOversizedInput(size)) return null;
  return oversizedInputMessage(size, UPSCALE_INPUT_MAX_SIDE);
}

export function buildUpscaleRequest(
  jobId: string,
  model: UpscaleModel,
  inputPath: string,
): UpscaleRequest {
  return { jobId, modelId: model.id, inputPath };
}

/** What stops Upscale, in the order the user can fix it. Null when it can run. A too-large picture does not block: the warning shows and the backend has the final say. */
export function upscaleBlockedReason(gate: {
  runtime: RuntimeStatus;
  model: UpscaleModel | null;
  inputPath: string | null;
  jobRunning: boolean;
}): string | null {
  if (gate.jobRunning) return UPSCALE_JOB_RUNNING_REASON;
  const runtimeReason = runtimeBlockedReason(gate.runtime, SD_CPP_NAME);
  if (runtimeReason) return runtimeReason;
  if (!gate.model) return UPSCALE_NO_MODEL_REASON;
  if (!gate.model.downloaded) return UPSCALE_DOWNLOAD_FIRST_REASON;
  if (!gate.inputPath) return NO_INPUT_REASON;
  return null;
}

/** The running job when it is of the given kind, else null. Each Playground image tab shows only its own jobs. */
export function jobOfKind(job: ImageJob | null, kind: ImageJobKind): ImageJob | null {
  return job?.kind === kind ? job : null;
}

/** The last result when it is of the given kind, else null. */
export function resultOfKind(result: ImageResult | null, kind: ImageJobKind): ImageResult | null {
  return result?.kind === kind ? result : null;
}

/** The label of an upscale job's stage. The upscaling stage counts its parts once the runtime reports them. */
export function upscalePhaseLabel(progress: GenerationProgressState): string {
  if (progress.phase === "sampling" && progress.step > 0 && progress.steps > 0) {
    return upscalePartLabel(progress.step, progress.steps);
  }
  return UPSCALE_PHASE_LABELS[progress.phase];
}
