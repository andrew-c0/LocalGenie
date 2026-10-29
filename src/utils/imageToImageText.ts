/** Copy for the Playground image to image tab, kept in one place so wording changes stay in one file. */

export const EDIT_SECTION_TITLE = "Edit image";

export const INPUT_PICK_LABEL = "Choose image";

export const INPUT_HINT = "PNG or JPG. The picture is read from disk and not changed.";

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
