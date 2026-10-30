import type { ImagePhase, ImageSize } from "../types";

/** Copy for the Playground Image upscaling tab, kept in one place so wording changes stay in one file. */

export const UPSCALE_TAB_LABEL = "Image upscaling";

export const UPSCALE_SECTION_TITLE = "Upscale image";

export const UPSCALE_ACTION_LABEL = "Upscale";

export const UPSCALE_PROGRESS_TITLE = "Upscaling";

export const UPSCALE_RESULT_TITLE = "Result";

export const UPSCALE_FACTOR_NOTE =
  "Upscaling is fixed at 4x: each side of the picture becomes four times longer.";

export const UPSCALE_INPUT_HINT =
  "PNG or JPG, up to 1024 px on the longest side and 30 MB. The picture is read from disk and not changed.";

export const UPSCALE_CPU_NOTE =
  "Upscaling runs on the CPU only. A 256 px picture takes about 10 to 20 seconds on the newest runtime build; older builds and larger pictures are much slower. Update the runtime in Settings > Runtimes.";

export const UPSCALE_LOADING_MODELS = "Reading upscaling models…";

export const UPSCALE_LOAD_ERROR = "Could not read the upscaling models.";

export const UPSCALE_FAILED_MESSAGE = "The image could not be upscaled.";

export const UPSCALE_CANCELLED_MESSAGE = "Upscaling cancelled.";

export const UPSCALE_NOT_SAVED_MESSAGE = "The upscaled image was not saved.";

export const UPSCALE_NO_MODEL_REASON = "Choose an upscaling model first.";

export const UPSCALE_DOWNLOAD_FIRST_REASON = "Download the model first.";

export const UPSCALE_JOB_RUNNING_REASON = "An image is already being processed.";

export const UPSCALE_DONE_TITLE = "Image upscaled";

export const UPSCALE_FAILED_TITLE = "Image upscaling failed";

export const UPSCALE_BEST_FOR_LABEL = "Best for";

export const UPSCALE_BEFORE_LABEL = "Before";

export const UPSCALE_AFTER_LABEL = "After (4x)";

/** The runtime check names the tab's job in its missing-runtime message. */
export const UPSCALE_RUNTIME_PURPOSE = "Image upscaling";

/** Stage names for an upscale job. The runtime has no prompt stage, so only the stages it reports are named. */
export const UPSCALE_PHASE_LABELS: Record<ImagePhase, string> = {
  loading: "Loading model",
  encoding: "Preparing picture",
  sampling: "Upscaling",
  decoding: "Finishing",
  saving: "Saving",
};

/** The warning under a picture that is larger than the upscaler accepts. */
export function oversizedInputMessage(size: ImageSize, maxSide: number): string {
  return `This picture is ${size.width} x ${size.height} px. Upscaling takes pictures up to ${maxSide} px on the longest side, so resize it first.`;
}

/** The step counter of the upscaling stage, e.g. "Upscaling part 2 of 6". Parts are what the runtime reports as steps. */
export function upscalePartLabel(step: number, steps: number): string {
  return `Upscaling part ${step} of ${steps}`;
}
