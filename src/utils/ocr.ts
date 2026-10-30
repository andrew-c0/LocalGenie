import type {
  ImageSize,
  OcrComputeSettings,
  OcrMode,
  OcrModel,
  OcrRequest,
  OcrResult,
  PlaygroundOcrDone,
} from "../types";
import { NO_INPUT_REASON } from "./imageToImageText";
import {
  OCR_DOWNLOAD_FIRST_REASON,
  OCR_JOB_RUNNING_REASON,
  OCR_NO_MODEL_REASON,
  OCR_SERVER_STOPPED_REASON,
  ocrOversizedMessage,
} from "./ocrText";

/** The backend refuses pictures with a longer side than this. */
export const OCR_INPUT_MAX_SIDE = 2500;

/** The compute choices a session starts with: the language model on the CPU, the vision encoder on the NPU. */
export const DEFAULT_OCR_COMPUTE: OcrComputeSettings = { compute: "cpu", visionCompute: "npu" };

/** The mode a model opens with: its first one. Null for a model that lists none. */
export function defaultOcrMode(model: OcrModel | null): OcrMode | null {
  return model?.modes[0]?.id ?? null;
}

/** The chosen mode when the model offers it, else the model's first mode. */
export function effectiveOcrMode(model: OcrModel | null, chosen: OcrMode): OcrMode {
  if (model?.modes.some((mode) => mode.id === chosen)) return chosen;
  return defaultOcrMode(model) ?? chosen;
}

/** The model a selection falls back to: the first downloaded one, else the first listed. */
export function defaultOcrModel(models: OcrModel[]): OcrModel | null {
  return models.find((model) => model.downloaded) ?? models[0] ?? null;
}

/** The warning for a picture that is too large, or null when its size is unknown or fine. */
export function ocrOversizedWarning(size: ImageSize | null): string | null {
  if (!size || Math.max(size.width, size.height) <= OCR_INPUT_MAX_SIDE) return null;
  return ocrOversizedMessage(size.width, size.height, OCR_INPUT_MAX_SIDE);
}

export function buildOcrRequest(
  jobId: string,
  model: OcrModel,
  imagePath: string,
  mode: OcrMode,
  settings: OcrComputeSettings,
  port: number,
): OcrRequest {
  return { jobId, modelId: model.id, imagePath, mode, ...settings, port };
}

/** What stops Read text, in the order the user can fix it. Null when it can run. */
export function ocrBlockedReason(gate: {
  model: OcrModel | null;
  inputPath: string | null;
  serverRunning: boolean;
  jobRunning: boolean;
}): string | null {
  if (gate.jobRunning) return OCR_JOB_RUNNING_REASON;
  if (!gate.model) return OCR_NO_MODEL_REASON;
  if (!gate.model.downloaded) return OCR_DOWNLOAD_FIRST_REASON;
  if (!gate.inputPath) return NO_INPUT_REASON;
  if (!gate.serverRunning) return OCR_SERVER_STOPPED_REASON;
  return null;
}

/** A new id for an OCR job. */
export function newOcrJobId(): string {
  return `ocr-${Date.now()}`;
}

/** The job result the store keeps, from the event payload. */
export function ocrResultOf(payload: PlaygroundOcrDone, inputName: string | null): OcrResult {
  return {
    jobId: payload.jobId,
    status: payload.status,
    text: payload.text ?? null,
    error: payload.error ?? null,
    seconds: payload.seconds,
    inputName,
  };
}

/** A suggested file name for the saved text: the picture's name with a .txt extension. */
export function ocrSaveName(inputName: string | null): string {
  const base = inputName?.replace(/\.[^./\\]+$/, "").trim();
  return `${base || "ocr-text"}.txt`;
}
