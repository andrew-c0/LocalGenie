import type { CompareCopy, ResultCopy } from "./playgroundText";

/** Copy for the Playground image to image tab, kept in one place so wording changes stay in one file. */

export const EDIT_SECTION_TITLE = "Edit image";

export const INPUT_PICK_LABEL = "Choose image";

export const INPUT_HINT = "PNG or JPG. The picture is read from disk and not changed.";

/** The accessible name of the info icon that holds the hint when the hint sits in a tooltip. */
export const INPUT_HINT_LABEL = "About the picture";

export const UNSUPPORTED_INPUT_MESSAGE = "Pick a PNG or JPG image.";

export const NO_INPUT_REASON = "Choose an input image first.";

export const USE_AS_INPUT_LABEL = "Use this image as input";

/** The prompt box label for a model that re-draws the picture from a prompt. */
export const PROMPT_LABEL_INIT = "Describe the new picture";

/** The prompt box label for a model that edits the picture from an instruction. */
export const PROMPT_LABEL_REFERENCE = "What to change";

export const PROMPT_PLACEHOLDER_REFERENCE = "e.g. make the field covered in snow";

export const PROMPT_PLACEHOLDER_INIT = "Describe the new picture";

export const STRENGTH_LABEL = "Strength";

export const STRENGTH_HELP =
  "How far the model moves away from your picture. Low keeps the picture, high changes more. Only re-draw models use it.";

export const INPUT_BADGE_REDRAW = "Re-draw";

export const INPUT_BADGE_EDIT = "Edit with instructions";

export const EDIT_SIZE_HINT =
  "The size follows the input picture's shape, near the model's native size. Sizes are multiples of 16.";

/** The footer note for image to image: edit models are slow on CPU, so the user is told how long to expect. */
export const EDIT_TIME_NOTE =
  "CPU runs can take a few minutes. Edit models take about a minute at 256 px.";

export const EDIT_STAGE_EMPTY_MESSAGE = "Choose a picture to edit it here.";

export const EDIT_PROGRESS_LABEL = "Editing";

export const EDIT_FAILED_MESSAGE = "The image could not be edited.";

export const EDIT_CANCELLED_MESSAGE = "Editing cancelled.";

export const EDIT_NOT_SAVED_MESSAGE = "The edited image was not saved.";

export const EDIT_ENLARGE_LABEL = "Enlarge edited picture";

export const EDIT_OUTPUT_ALT = "Edited image";

/** The comparison labels: the picture before the edit, and the result of it. */
export const EDIT_BEFORE_LABEL = "Input";

export const EDIT_AFTER_LABEL = "Result";

export const EDIT_TIME_INFO_LABEL = "About the edit time";

export const EDIT_RESULT_TIME_LABEL = "How long it took";

export const COMPUTED_ON_LABEL = "Where it was computed";

export const SAVED_PATH_LABEL = "Where the picture was saved";

export const USE_SEED_LABEL = "Use seed";

export const GENERATE_LABEL = "Generate";

export const CLEAR_INPUT_LABEL = "Clear";

export const EDIT_ADVANCED_LABEL = "Advanced settings";

export const EDIT_COMPARE_COPY: CompareCopy = {
  before: EDIT_BEFORE_LABEL,
  after: EDIT_AFTER_LABEL,
  beforeAlt: "Input image",
  afterAlt: EDIT_OUTPUT_ALT,
};

export const EDIT_RESULT_COPY: ResultCopy = {
  failedMessage: EDIT_FAILED_MESSAGE,
  cancelledMessage: EDIT_CANCELLED_MESSAGE,
  notSavedMessage: EDIT_NOT_SAVED_MESSAGE,
  enlargeLabel: EDIT_ENLARGE_LABEL,
  outputAlt: EDIT_OUTPUT_ALT,
  compare: EDIT_COMPARE_COPY,
};

/** The size button's text, e.g. "512 x 768". */
export function editSizeLabel(width: number, height: number): string {
  return `${width} x ${height}`;
}

/** The tooltip of the time icon in the result bar, e.g. "Edited in 1 min 4 s". */
export function editedInLabel(duration: string): string {
  return `Edited in ${duration}`;
}

/** The tooltip of the device icon in the result bar. */
export function computedOnLabel(deviceSummary: string): string {
  return `Computed on ${deviceSummary}`;
}

export function seedLabel(seed: number): string {
  return `Seed ${seed}`;
}
