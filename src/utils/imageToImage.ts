import type {
  ImageForm,
  ImageGenerateRequest,
  ImageInputKind,
  ImageModel,
  ImageSize,
} from "../types";
import {
  INPUT_BADGE_EDIT,
  INPUT_BADGE_REDRAW,
  NO_INPUT_REASON,
  PROMPT_LABEL_INIT,
  PROMPT_LABEL_REFERENCE,
} from "./imageToImageText";
import {
  buildImageRequest,
  IMAGE_SIZE_MAX,
  IMAGE_SIZE_MIN,
  imageJobBlockedReason,
  type RuntimeStatus,
} from "./playground";

/** Edit models take sizes that are multiples of this, so the size from an input picture uses it. */
export const EDIT_SIZE_STEP = 16;

export const STRENGTH_MIN = 0.05;
export const STRENGTH_MAX = 1;
export const STRENGTH_STEP = 0.05;
/** Where the strength slider starts: the picture stays recognisable and still changes. */
export const DEFAULT_STRENGTH = 0.6;

const SUPPORTED_INPUT_PATTERN = /\.(png|jpe?g)$/i;

/** The models image to image lists: the ones that take a picture, re-draw or edit. */
export function imageToImageModels(models: ImageModel[]): ImageModel[] {
  return models.filter(isImageToImageModel);
}

/** True for a model that takes an input picture. */
export function isImageToImageModel(model: ImageModel): boolean {
  return model.imageInput === "init" || model.imageInput === "reference";
}

/** The picker accepts PNG and JPG only (JPEG included), whatever extension case the file has. */
export function isSupportedInputPath(path: string): boolean {
  return SUPPORTED_INPUT_PATTERN.test(path);
}

/** The file name at the end of a path, for either slash style. */
export function inputFileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** The strength the request sends: kept between the slider's ends. */
export function clampStrength(strength: number): number {
  return Math.min(STRENGTH_MAX, Math.max(STRENGTH_MIN, strength));
}

/** A value rounded to the nearest multiple of `step`, kept inside the size limits. */
function snapToStep(value: number, step: number): number {
  const snapped = Math.round(value / step) * step;
  return Math.min(IMAGE_SIZE_MAX, Math.max(IMAGE_SIZE_MIN, snapped));
}

/**
 * The size an edit starts at: the input picture's shape, with about the pixel count of the model's
 * native size. A very long picture is scaled down as a whole so the shape holds. Each side is a
 * multiple of 16 and stays inside the size limits.
 */
export function editSizeFor(source: ImageSize, native: ImageSize): ImageSize {
  if (source.width <= 0 || source.height <= 0) return { ...native };
  const aspect = source.width / source.height;
  const area = native.width * native.height;
  const width = Math.sqrt(area * aspect);
  const height = Math.sqrt(area / aspect);
  const fit = Math.min(1, IMAGE_SIZE_MAX / Math.max(width, height));
  return {
    width: snapToStep(width * fit, EDIT_SIZE_STEP),
    height: snapToStep(height * fit, EDIT_SIZE_STEP),
  };
}

/** The form with its size taken from the input picture. The form is returned as it is until the picture's size is known. */
export function formWithInputSize(
  form: ImageForm,
  source: ImageSize | null,
  native: ImageSize,
): ImageForm {
  return source ? { ...form, ...editSizeFor(source, native) } : form;
}

/**
 * The request for `playground_generate_image` with an input picture. The strength is sent only for
 * a re-draw (`init`) model; the rest of the request is the text to image one.
 */
export function buildEditRequest(
  jobId: string,
  model: ImageModel,
  form: ImageForm,
  inputPath: string,
  strength: number,
): ImageGenerateRequest {
  const request = { ...buildImageRequest(jobId, model, form), inputPath };
  if (model.imageInput !== "init") return request;
  return { ...request, strength: clampStrength(strength) };
}

/** What stops an image to image Generate, in the order the user can fix it. Null when it can run. */
export function editBlockedReason(gate: {
  runtime: RuntimeStatus;
  model: ImageModel | null;
  inputPath: string | null;
  prompt: string;
  jobRunning: boolean;
}): string | null {
  const jobReason = imageJobBlockedReason(gate);
  if (jobReason) return jobReason;
  if (!gate.inputPath) return NO_INPUT_REASON;
  if (!gate.prompt.trim()) return "Write a prompt first.";
  return null;
}

/** The small badge on a model card: how the model uses the input picture. Null for a model that takes none. */
export function inputBadgeLabel(kind: ImageInputKind): string | null {
  if (kind === "init") return INPUT_BADGE_REDRAW;
  if (kind === "reference") return INPUT_BADGE_EDIT;
  return null;
}

/** The prompt box label: an instruction for an editing model, a description of the new picture for a re-draw model. */
export function editPromptLabel(kind: ImageInputKind | null): string {
  return kind === "reference" ? PROMPT_LABEL_REFERENCE : PROMPT_LABEL_INIT;
}
