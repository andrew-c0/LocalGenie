import type { ImagePhase, ImageSize } from "../types";
import type { ResultCopy } from "./playgroundText";

/** Copy for the Playground Image upscaling tab, kept in one place so wording changes stay in one file. */

export const UPSCALE_TAB_LABEL = "Image upscaling";

export const UPSCALE_SECTION_TITLE = "Upscale image";

export const UPSCALE_ACTION_LABEL = "Upscale";

export const UPSCALE_PROGRESS_TITLE = "Upscaling";

export const UPSCALE_ENLARGE_LABEL = "Enlarge upscaled picture";

/** Shown in the stage before a picture is chosen, so the empty card still says what to do. */
export const UPSCALE_STAGE_EMPTY_MESSAGE = "Choose a picture to upscale it here.";

export const UPSCALE_FACTOR_NOTE =
  "Upscaling is fixed at 4x: each side of the picture becomes four times longer.";

/** The accessible name of the info icon next to the scale in the card header. */
export const UPSCALE_SCALE_INFO_LABEL = "About the scale";

export const UPSCALE_CLEAR_LABEL = "Clear";

/** The accessible name of the folder icon under a result; its tooltip is the saved path. */
export const UPSCALE_SAVED_PATH_LABEL = "Where the picture was saved";

export const UPSCALE_TIME_LABEL = "How long it took";

/** The tooltip of the timer icon under a result, e.g. "Upscaled in 21.1s". */
export function upscaledInLabel(duration: string): string {
  return `Upscaled in ${duration}`;
}

export const UPSCALE_INPUT_HINT =
  "PNG or JPG, up to 1024 px on the longest side and 30 MB. The picture is read from disk and not changed.";

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

/** The picture's own alt text, shared by the result and the comparison. */
export const UPSCALE_INPUT_ALT = "Input image";

export const UPSCALE_OUTPUT_ALT = "Upscaled image";

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

/** The result view's words for an upscale: its failure reasons, the enlarge label and the Before / After comparison. */
export const UPSCALE_RESULT_COPY: ResultCopy = {
  failedMessage: UPSCALE_FAILED_MESSAGE,
  cancelledMessage: UPSCALE_CANCELLED_MESSAGE,
  notSavedMessage: UPSCALE_NOT_SAVED_MESSAGE,
  enlargeLabel: UPSCALE_ENLARGE_LABEL,
  outputAlt: UPSCALE_OUTPUT_ALT,
  compare: {
    before: UPSCALE_BEFORE_LABEL,
    after: UPSCALE_AFTER_LABEL,
    beforeAlt: UPSCALE_INPUT_ALT,
    afterAlt: UPSCALE_OUTPUT_ALT,
  },
};
