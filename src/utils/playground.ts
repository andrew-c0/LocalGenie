import type {
  ImageForm,
  ImageGenerateRequest,
  ImageJob,
  ImageModel,
  ImageModelDefaults,
  ImagePhase,
  ImageSize,
  PlaygroundDevice,
  PlaygroundDeviceKind,
  PlaygroundDownloadProgress,
} from "../types";
import { formatBytes } from "./format";
import {
  AUTO_COMPUTE_LABEL,
  AUTO_COMPUTE_LABEL_ON_CPU,
  AUTO_COMPUTE_SUMMARY,
  DEVICE_KIND_LABELS,
  fixedCfgReason,
  NO_NEGATIVE_PROMPT_REASON,
  nativeSizeHint,
  PHASE_LABELS,
  SIZE_HINT_WITHOUT_MODEL,
  samplingStepLabel,
} from "./playgroundText";

/** Runtime id of stable-diffusion.cpp in the runtime registry. */
export const SD_CPP_RUNTIME_ID = "sd-cpp";
/** The name stable-diffusion.cpp goes by in messages. */
export const SD_CPP_NAME = "stable-diffusion.cpp";

/** Width and height must be multiples of this, within the min and max. */
export const IMAGE_SIZE_STEP = 8;
export const IMAGE_SIZE_MIN = 64;
export const IMAGE_SIZE_MAX = 2048;

/** Quick sizes offered beside the Width and Height fields. The selected model's default is added too. */
export const IMAGE_SIZE_PRESETS: readonly ImageSize[] = [
  { width: 512, height: 512 },
  { width: 512, height: 768 },
  { width: 768, height: 512 },
  { width: 768, height: 768 },
];

/** The compute choice that leaves the device to the runtime. A request sends no `device` for it. */
export const DEVICE_AUTO = "auto";

/** Stages in the order the backend runs them. */
export const IMAGE_PHASES: readonly ImagePhase[] = [
  "loading",
  "encoding",
  "sampling",
  "decoding",
  "saving",
];

/** Starting form before a model is picked. A model's defaults replace these fields on selection. */
export const DEFAULT_IMAGE_FORM: ImageForm = {
  prompt: "",
  negativePrompt: "",
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7,
  randomSeed: true,
  seed: 0,
  device: DEVICE_AUTO,
};

/** The model a selection falls back to: the first downloaded one, else the first listed. */
export function defaultImageModel(models: ImageModel[]): ImageModel | null {
  return models.find((model) => model.downloaded) ?? models[0] ?? null;
}

/** The form with a model's size, steps and CFG scale. The prompt and seed are kept. */
export function applyModelDefaults(form: ImageForm, defaults: ImageModelDefaults): ImageForm {
  return {
    ...form,
    width: defaults.width,
    height: defaults.height,
    steps: defaults.steps,
    cfgScale: defaults.cfgScale,
  };
}

export function imageSizeLabel(size: ImageSize): string {
  return `${size.width} x ${size.height}`;
}

function sameSize(a: ImageSize, b: ImageSize): boolean {
  return a.width === b.width && a.height === b.height;
}

/** A typed number as an integer, or null when the text is blank or not a plain whole number. */
function parseWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

function clampImageDimension(value: number): number {
  return Math.min(IMAGE_SIZE_MAX, Math.max(IMAGE_SIZE_MIN, value));
}

/**
 * The valid width or height nearest to the typed text: a multiple of `step` (8 for text to image)
 * within 64 to 2048. Text that is blank or not a number gives `fallback`, so the field goes back to
 * the value it had.
 */
export function snapImageSize(text: string, fallback: number, step = IMAGE_SIZE_STEP): number {
  const parsed = parseWholeNumber(text);
  if (parsed === null) return fallback;
  return clampImageDimension(Math.round(parsed / step) * step);
}

/**
 * Why a typed width or height cannot be used as it is, or null when it is valid. The message names
 * the field, and for a size that is off the step, the nearest valid value.
 */
export function imageSizeError(
  fieldName: string,
  text: string,
  step = IMAGE_SIZE_STEP,
): string | null {
  const parsed = parseWholeNumber(text);
  if (parsed === null) return `${fieldName} must be a whole number.`;
  if (parsed < IMAGE_SIZE_MIN || parsed > IMAGE_SIZE_MAX) {
    return `${fieldName} must be between ${IMAGE_SIZE_MIN} and ${IMAGE_SIZE_MAX}.`;
  }
  if (parsed % step !== 0) {
    const nearest = snapImageSize(text, IMAGE_SIZE_MIN, step);
    return `${fieldName} must be a multiple of ${step}. Nearest is ${nearest}.`;
  }
  return null;
}

export interface SizePresetOption extends ImageSize {
  label: string;
}

/**
 * The preset buttons: the fixed presets, plus the model's native size when it is not one of them.
 * The native size is labelled as the model default.
 */
export function sizePresetOptions(nativeSize: ImageSize | null): SizePresetOption[] {
  const nativeIsPreset =
    nativeSize !== null && IMAGE_SIZE_PRESETS.some((preset) => sameSize(preset, nativeSize));
  const sizes =
    nativeSize && !nativeIsPreset ? [...IMAGE_SIZE_PRESETS, nativeSize] : [...IMAGE_SIZE_PRESETS];

  return sizes.map((size) => {
    const isNative = nativeSize !== null && sameSize(size, nativeSize);
    const label = isNative ? `${imageSizeLabel(size)} (model default)` : imageSizeLabel(size);
    return { width: size.width, height: size.height, label };
  });
}

/** The hint under the presets. Names the model's native size when there is one. */
export function sizeHintText(nativeSize: ImageSize | null): string {
  return nativeSize ? nativeSizeHint(imageSizeLabel(nativeSize)) : SIZE_HINT_WITHOUT_MODEL;
}

export interface ImageFormControls {
  /** Why the negative prompt cannot be typed, or null when it can. */
  negativePromptReason: string | null;
  /** Why the CFG scale is fixed, or null when it can be changed. */
  cfgReason: string | null;
}

/** Which form fields the selected model lets the user change, and the reason when it does not. No model means nothing is locked. */
export function imageFormControls(model: ImageModel | null): ImageFormControls {
  return {
    negativePromptReason: model && !model.supportsNegativePrompt ? NO_NEGATIVE_PROMPT_REASON : null,
    cfgReason: model && !model.cfgAdjustable ? fixedCfgReason(model.defaults.cfgScale) : null,
  };
}

/**
 * The request for `playground_generate_image`. The prompts are trimmed; a negative prompt is left
 * out for a model that ignores it. A CFG scale the model fixes is replaced by its default. The
 * device is left out for auto.
 */
export function buildImageRequest(
  jobId: string,
  model: ImageModel,
  form: ImageForm,
): ImageGenerateRequest {
  const negativePrompt = form.negativePrompt.trim();
  return {
    jobId,
    modelId: model.id,
    prompt: form.prompt.trim(),
    negativePrompt:
      model.supportsNegativePrompt && negativePrompt !== "" ? negativePrompt : undefined,
    width: form.width,
    height: form.height,
    steps: form.steps,
    cfgScale: model.cfgAdjustable ? form.cfgScale : model.defaults.cfgScale,
    seed: form.randomSeed ? -1 : form.seed,
    device: deviceForRequest(form.device),
  };
}

/** Label of a device kind. An unknown kind from the runtime reads as "Other". */
export function deviceKindLabel(kind: PlaygroundDeviceKind): string {
  return DEVICE_KIND_LABELS[kind] ?? DEVICE_KIND_LABELS.other;
}

/** "CPU – Snapdragon X Elite": the kind, then the description when the device has one. */
export function deviceOptionLabel(device: PlaygroundDevice): string {
  const kindLabel = deviceKindLabel(device.kind);
  return device.description.trim() ? `${kindLabel} – ${device.description}` : kindLabel;
}

export interface ComputeOption {
  value: string;
  label: string;
}

/** True when the build lists a CPU. Auto runs on the CPU in that case, so the label says so. */
export function hasCpuDevice(devices: PlaygroundDevice[]): boolean {
  return devices.some((device) => device.kind === "cpu");
}

/** The Auto label: "Auto (CPU)" when the build lists a CPU, else plain "Auto". */
export function autoComputeLabel(devices: PlaygroundDevice[]): string {
  return hasCpuDevice(devices) ? AUTO_COMPUTE_LABEL_ON_CPU : AUTO_COMPUTE_LABEL;
}

/** The Compute dropdown: Auto, then one entry per device the build lists. */
export function computeOptions(devices: PlaygroundDevice[]): ComputeOption[] {
  const deviceOptions = devices.map((device) => ({
    value: device.name,
    label: deviceOptionLabel(device),
  }));
  return [{ value: DEVICE_AUTO, label: autoComputeLabel(devices) }, ...deviceOptions];
}

/** The `device` for a generate request, or undefined for auto, which the request leaves out. */
export function deviceForRequest(selected: string): string | undefined {
  return selected === DEVICE_AUTO ? undefined : selected;
}

/** The selection when its device is still listed, else auto. Used after a device refresh. */
export function keepDeviceSelection(selected: string, devices: PlaygroundDevice[]): string {
  if (selected === DEVICE_AUTO || devices.some((device) => device.name === selected)) {
    return selected;
  }
  return DEVICE_AUTO;
}

/** True when the selection is a listed GPU. Auto and a device no longer listed are not GPUs. */
export function isGpuSelection(selected: string, devices: PlaygroundDevice[]): boolean {
  return devices.some((device) => device.name === selected && device.kind === "gpu");
}

/** True when the build lists the CPU and nothing else. An empty list says nothing about the build. */
export function isCpuOnlyBuild(devices: PlaygroundDevice[]): boolean {
  return devices.length > 0 && devices.every((device) => device.kind === "cpu");
}

/**
 * The device a result ran on, for its summary. A device no longer listed shows its raw name, since
 * its description is gone with it.
 */
export function deviceSummaryLabel(selected: string, devices: PlaygroundDevice[]): string {
  if (selected === DEVICE_AUTO) return AUTO_COMPUTE_SUMMARY;
  const device = devices.find((candidate) => candidate.name === selected);
  return device ? deviceOptionLabel(device) : selected;
}

/**
 * Disk space that deleting `model` frees: its files that no other downloaded model also uses. Files
 * are matched by name, so a file two models share is kept while either of them is downloaded.
 */
export function freedBytesOnDelete(model: ImageModel, models: ImageModel[]): number {
  const keptFileNames = new Set(
    models
      .filter((other) => other.downloaded && other.id !== model.id)
      .flatMap((other) => other.files.map((file) => file.fileName)),
  );
  return model.files
    .filter((file) => !keptFileNames.has(file.fileName))
    .reduce((total, file) => total + file.sizeBytes, 0);
}

/**
 * Share of the whole model download that is done: the files finished before the current one, plus
 * the current file's share. Null while the current file's size is unknown, so the bar is indeterminate.
 */
export function overallDownloadPercent(
  progress: Pick<PlaygroundDownloadProgress, "fileIndex" | "fileCount" | "received" | "total">,
): number | null {
  if (progress.fileCount <= 0 || progress.total <= 0) return null;
  const currentShare = Math.min(1, progress.received / progress.total);
  const share = (progress.fileIndex + currentShare) / progress.fileCount;
  return Math.min(100, Math.round(share * 100));
}

/** "12.0 MB of 63.0 MB", or just "12.0 MB" when the total is not known. */
export function byteProgressLabel(received: number, total: number): string {
  if (total <= 0) return formatBytes(received);
  return `${formatBytes(received)} of ${formatBytes(total)}`;
}

/** One line for a model download: the file, its place in the list and the bytes. Null progress means the download has just started. */
export function downloadProgressLabel(progress: PlaygroundDownloadProgress | null): string {
  if (!progress) return "Starting download…";
  const place =
    progress.fileCount > 1 ? ` (file ${progress.fileIndex + 1} of ${progress.fileCount})` : "";
  return `Downloading ${progress.fileName}${place}: ${byteProgressLabel(progress.received, progress.total)}`;
}

/** The progress fields of a generation: where it is and how fast it runs. */
export type GenerationProgressState = Pick<ImageJob, "phase" | "step" | "steps" | "secondsPerStep">;

/** Label of one stage. The generating stage names its step once the step counter has moved. */
export function imagePhaseLabel(phase: ImagePhase, step: number, steps: number): string {
  if (phase !== "sampling") return PHASE_LABELS[phase];
  return step > 0 ? samplingStepLabel(step, steps) : PHASE_LABELS.sampling;
}

export type PhaseStatus = "done" | "active" | "pending";

export interface GenerationPhaseRow {
  phase: ImagePhase;
  label: string;
  status: PhaseStatus;
}

/** Every stage with its label, and whether it is finished, running or still to come. */
export function generationPhaseRows(progress: GenerationProgressState): GenerationPhaseRow[] {
  const activeIndex = IMAGE_PHASES.indexOf(progress.phase);
  return IMAGE_PHASES.map((phase, index) => ({
    phase,
    label: imagePhaseLabel(phase, progress.step, progress.steps),
    status: phaseStatus(index, activeIndex),
  }));
}

function phaseStatus(index: number, activeIndex: number): PhaseStatus {
  if (index < activeIndex) return "done";
  return index === activeIndex ? "active" : "pending";
}

/**
 * Percent of the sampling steps finished. Null outside `sampling` and before the step count is
 * known, so the bar is indeterminate there.
 */
export function jobProgressPercent(progress: GenerationProgressState): number | null {
  if (progress.phase !== "sampling" || progress.steps <= 0) return null;
  return Math.min(100, Math.round((progress.step / progress.steps) * 100));
}

/** "about 2.5 s per step, ~18 s left" while sampling with a measured step time, else null. */
export function generationEtaLabel(progress: GenerationProgressState): string | null {
  if (progress.phase !== "sampling" || progress.secondsPerStep === null) return null;
  const secondsLeft = Math.max(0, progress.steps - progress.step) * progress.secondsPerStep;
  return `about ${progress.secondsPerStep.toFixed(1)} s per step, ~${Math.round(secondsLeft)} s left`;
}

/** Elapsed time as minutes and seconds, e.g. 65 000 ms is "1:05". */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/** Whether a tab's runtime is installed, as the Playground sees it. */
export type RuntimeStatus = "checking" | "installed" | "missing" | "failed";

/** Why a runtime that is not installed blocks a job, or null when it is installed. Names the runtime and where to install it. */
export function runtimeBlockedReason(runtime: RuntimeStatus, runtimeName: string): string | null {
  if (runtime === "checking") return "Checking the runtime…";
  if (runtime === "failed") return "Could not check the runtime.";
  if (runtime === "missing") return `Install ${runtimeName} in Settings > Runtimes first.`;
  return null;
}

/** The reasons every image job shares, in the order the user can fix them. Null when a job may start. */
export function imageJobBlockedReason(gate: {
  runtime: RuntimeStatus;
  model: ImageModel | null;
  jobRunning: boolean;
}): string | null {
  if (gate.jobRunning) return "An image is already being generated.";
  const runtimeReason = runtimeBlockedReason(gate.runtime, SD_CPP_NAME);
  if (runtimeReason) return runtimeReason;
  if (!gate.model) return "Choose a model first.";
  if (!gate.model.downloaded) return "Download the model first.";
  return null;
}

/** What stops Generate from running, in the order the user can fix it. Null when it can run. */
export function generateBlockedReason(gate: {
  runtime: RuntimeStatus;
  model: ImageModel | null;
  prompt: string;
  jobRunning: boolean;
}): string | null {
  const jobReason = imageJobBlockedReason(gate);
  if (jobReason) return jobReason;
  if (!gate.prompt.trim()) return "Write a prompt first.";
  return null;
}
