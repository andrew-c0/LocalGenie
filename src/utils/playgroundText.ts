import type { ImagePhase, PlaygroundDeviceKind } from "../types";

/** Copy for the Playground text-to-image form, kept in one place so wording changes stay in one file. */

/** Shared by the Playground image tabs: the compare switch and its slider, the folder button, and the reveal error. */
export const COMPARE_LABEL = "Compare";

export const COMPARE_SLIDER_LABEL = "Comparison position";

export const SHOW_IN_FOLDER_LABEL = "Show in folder";

export const REVEAL_FAILED_TITLE = "Could not open the folder";

export const OPENING_IMAGE_MESSAGE = "Opening the image…";

/** The result bar's time tooltip: the label of the icon and the sentence that names the duration. */
export interface ResultBarCopy {
  timeLabel: string;
  timeHelp: (duration: string) => string;
}

/** The corner chips and alt texts of the before and after comparison. */
export interface CompareCopy {
  before: string;
  after: string;
  beforeAlt: string;
  afterAlt: string;
}

/** The words a result view needs: the reasons it has no picture, the enlarge label, and the comparison copy. */
export interface ResultCopy {
  failedMessage: string;
  cancelledMessage: string;
  notSavedMessage: string;
  enlargeLabel: string;
  outputAlt: string;
  /** The comparison copy. Left out by a tab with no input picture, which has no comparison. */
  compare?: CompareCopy;
}

export const STEPS_HELP =
  "How many refinement passes the model makes. More steps usually add detail up to a point, but take proportionally longer. Fast 'turbo' models are made for 1-8 steps; more does not help them.";

export const CFG_SCALE_HELP =
  "How strictly the model follows your prompt. Low = freer and more varied, high = closer to the prompt but can look harsh or over-saturated. Distilled models (FLUX.2 klein, Z-Image Turbo) are built for 1 and ignore changes.";

export const SEED_HELP =
  "Starting noise. The same seed with the same settings gives the same image; random picks a new one each time.";

export const NEGATIVE_PROMPT_HELP =
  "Things to steer away from, e.g. 'blurry, extra fingers'. Describe what you do not want, not a sentence like 'no boats'. Only works with models that use CFG above 1.";

export const NEGATIVE_PROMPT_HINT = "Optional. What the image should leave out.";

export const NO_NEGATIVE_PROMPT_REASON = "This model does not use a negative prompt.";

export const SIZE_HINT_WITHOUT_MODEL =
  "Models work best near their native size. Other sizes are allowed but may look worse and are slower.";

export const MODEL_LOAD_NOTE =
  "The model is loaded when you generate and released when the image is done.";

export const COMPUTE_HELP =
  "Where the image is computed. Auto uses the CPU. GPU (OpenCL, Qualcomm Adreno) is experimental: on small models it can be slower than the CPU, and very small images (around 128 px) may come out blank; it may be faster on larger models. NPU is not supported yet. Only the devices your build reports are listed.";

export const CPU_ONLY_BUILD_HINT = "This build only supports the CPU.";

export const GPU_EXPERIMENTAL_HINT = "Experimental: may be slower than the CPU.";

/** The Auto choice when the build lists the CPU, which Auto then runs on. */
export const AUTO_COMPUTE_LABEL_ON_CPU = "Auto (CPU)";

export const AUTO_COMPUTE_LABEL = "Auto";

/** The result summary's name for the auto choice: the device the runtime picks by default. */
export const AUTO_COMPUTE_SUMMARY = "Auto (CPU)";

export const DEVICE_KIND_LABELS: Record<PlaygroundDeviceKind, string> = {
  cpu: "CPU",
  gpu: "GPU",
  npu: "NPU",
  other: "Other",
};

export function deleteModelTitle(modelName: string): string {
  return `Delete ${modelName}?`;
}

/** The delete dialog's body. `freedSize` is the disk space the model's own files take. */
export function deleteModelMessage(freedSize: string): string {
  return `This frees about ${freedSize} of disk space. You can download it again later. Files shared with other downloaded models are kept.`;
}

export const PHASE_LABELS: Record<ImagePhase, string> = {
  loading: "Loading model",
  encoding: "Reading prompt",
  sampling: "Generating image",
  decoding: "Decoding image",
  saving: "Saving",
};

/** Label of the generating phase once its step counter is known, e.g. "Generating step 3 of 4". */
export function samplingStepLabel(step: number, steps: number): string {
  return `Generating step ${step} of ${steps}`;
}

/** Why the CFG scale cannot be changed for a model. */
export function fixedCfgReason(cfgScale: number): string {
  return `Fixed at ${cfgScale} for this model.`;
}

/** The size hint under the presets. Names the model's native size when there is one. */
export function nativeSizeHint(nativeSizeLabel: string): string {
  return `Models work best near their native size (${nativeSizeLabel}). Other sizes are allowed but may look worse and are slower.`;
}

/** Why a tab cannot run until its runtime is installed. `purpose` names the tab's job, e.g. "Image generation". */
export function runtimeMissingMessage(purpose: string, runtimeName: string): string {
  return `${purpose} needs ${runtimeName}. Install it in Settings > Runtimes.`;
}

export const ADVANCED_SETTINGS_LABEL = "Advanced settings";

export const GENERATE_LABEL = "Generate";

export const GENERATE_PROGRESS_LABEL = "Generating";

/** The text to image stage before any picture has been generated. */
export const TEXT_STAGE_EMPTY_MESSAGE = "The generated picture appears here.";

export const COMPUTED_ON_LABEL = "Where it was computed";

export const SAVED_PATH_LABEL = "Where the picture was saved";

export const USE_SEED_LABEL = "Use seed";

export const GENERATE_RESULT_COPY: ResultCopy = {
  failedMessage: "The image could not be generated.",
  cancelledMessage: "Generation cancelled.",
  notSavedMessage: "The image was not saved.",
  enlargeLabel: "Enlarge generated picture",
  outputAlt: "Generated image",
};

export const GENERATE_RESULT_BAR_COPY: ResultBarCopy = {
  timeLabel: "How long it took",
  timeHelp: (duration) => `Generated in ${duration}`,
};

/** The size button's text, e.g. "512 x 768". Shared by both image tabs. */
export function sizeLabel(width: number, height: number): string {
  return `${width} x ${height}`;
}

/** The tooltip that names the device a result ran on. */
export function computedOnLabel(deviceSummary: string): string {
  return `Computed on ${deviceSummary}`;
}

export function seedLabel(seed: number): string {
  return `Seed ${seed}`;
}

export const GENERATE_SECTION_TITLE = "Generate";

export const GENERATE_PROMPT_LABEL = "Prompt";

export const GENERATE_PROMPT_PLACEHOLDER = "Describe the image";

export const GENERATE_TIME_INFO_LABEL = "About the generation time";
