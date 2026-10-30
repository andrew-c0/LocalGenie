import type { OcrCompute, OcrVisionCompute } from "../types";

/** Copy for the Playground OCR tab, kept in one place so wording changes stay in one file. */

export const OCR_TAB_LABEL = "OCR";

export const OCR_SECTION_TITLE = "Read text from a picture";

export const OCR_ACTION_LABEL = "Read text";

export const OCR_PROGRESS_TITLE = "Reading";

export const OCR_RESULT_TITLE = "Recognised text";

export const OCR_INPUT_HINT =
  "PNG or JPG, up to 2500 px on the longest side and 30 MB. The picture is read from disk and not changed.";

export const OCR_LOADING_MODELS = "Reading OCR models…";

export const OCR_LOAD_ERROR = "Could not read the OCR models.";

export const OCR_FAILED_MESSAGE = "The text could not be read.";

export const OCR_CANCELLED_MESSAGE = "Reading cancelled.";

export const OCR_EMPTY_MESSAGE = "No text was found in the picture.";

export const OCR_NO_MODEL_REASON = "Choose an OCR model first.";

export const OCR_DOWNLOAD_FIRST_REASON = "Download the model first.";

export const OCR_JOB_RUNNING_REASON = "A picture is already being read.";

export const OCR_SERVER_STOPPED_REASON = "Start the GenieX server first.";

export const OCR_DONE_TITLE = "Text read";

export const OCR_FAILED_TITLE = "Reading text failed";

export const OCR_BEST_FOR_LABEL = "Best for";

export const OCR_MODE_LABEL = "Read as";

export const OCR_COMPUTE_TITLE = "Where it runs";

export const OCR_LANGUAGE_MODEL_LABEL = "Language model";

export const OCR_VISION_LABEL = "Picture reading (vision encoder)";

export const OCR_COMPUTE_HELP =
  "Measured on a Snapdragon X Elite, the NPU cut a small page from about 48 s to about 17 s. The language model is fastest on the CPU, the NPU is similar overall and the GPU is slowest.";

export const OCR_TIME_NOTE =
  "There is no progress bar: the model reads the whole picture before it answers, so the time depends on the picture and the compute choices.";

export const OCR_SERVER_NOTICE = "OCR runs on the GenieX server, and the server is not running.";

export const OCR_START_SERVER_LABEL = "Start server";

export const OCR_SERVER_START_FAILED = "Could not start the GenieX server.";

export const OCR_COPY_LABEL = "Copy";

export const OCR_SAVE_LABEL = "Save as .txt";

export const OCR_COPIED_TITLE = "Text copied";

export const OCR_SAVED_TITLE = "Text saved";

export const OCR_SAVE_FAILED_TITLE = "Could not save the text";

export const OCR_COPY_FAILED_TITLE = "Could not copy the text";

export const OCR_COMPUTE_LABELS: Record<OcrCompute, string> = {
  auto: "Auto",
  cpu: "CPU",
  gpu: "GPU",
  npu: "NPU",
};

export const OCR_VISION_LABELS: Record<OcrVisionCompute, string> = {
  cpu: "CPU",
  npu: "NPU",
};

/** The warning under a picture that is larger than OCR accepts. */
export function ocrOversizedMessage(width: number, height: number, maxSide: number): string {
  return `This picture is ${width} x ${height} px. OCR takes pictures up to ${maxSide} px on the longest side, so resize it first.`;
}

/** The time line under a result, e.g. "Read in 17s". */
export function ocrTookLabel(duration: string): string {
  return `Read in ${duration}`;
}
