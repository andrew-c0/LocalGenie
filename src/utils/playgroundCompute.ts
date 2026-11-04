import type { OcrComputeSettings, PlaygroundDevice } from "../types";
import { OCR_COMPUTE_HELP, OCR_LANGUAGE_MODEL_LABEL, OCR_VISION_LABEL } from "./ocrText";
import { autoComputeLabel, DEVICE_AUTO, isCpuOnlyBuild, isGpuSelection } from "./playground";
import type { PlaygroundToolId } from "./playgroundSelector";
import { COMPUTE_HELP, CPU_ONLY_BUILD_HINT, GPU_EXPERIMENTAL_HINT } from "./playgroundText";

/**
 * The compute choices the Playground's selector offers. Auto leaves the choice to the runtime; the
 * others name where the work runs. Each tool enables only the ones it supports.
 */
export type RunOnValue = "auto" | "npu" | "gpu" | "cpu";

/** The setting a choice writes to. Null for a fixed row (a tool that runs on the CPU only). */
export type ComputeSetting = "device" | "ocrCompute" | "ocrVision";

export interface RunOnOption {
  value: RunOnValue;
  label: string;
  enabled: boolean;
}

/** One "where it runs" row of the selector. */
export interface ComputeRowView {
  setting: ComputeSetting | null;
  label: string;
  /** A plain-language explanation shown from an info icon beside the label. */
  help: string | null;
  value: RunOnValue;
  options: RunOnOption[];
  /** The line under the options, right-aligned. Null for none. */
  hint: string | null;
}

/** The order of the options, the same as the chat selector's Run on row (NPU, GPU, CPU), with Auto first. */
const RUN_ON_ORDER: readonly RunOnValue[] = ["auto", "npu", "gpu", "cpu"];

const RUN_ON_LABELS: Record<RunOnValue, string> = {
  auto: "Auto",
  npu: "NPU",
  gpu: "GPU",
  cpu: "CPU",
};

const RUN_ON_LABEL = "Run on";

const SPEECH_CPU_ONLY_HINT = "Speech runs on the CPU only.";

const UPSCALE_CPU_ONLY_HINT = "Upscaling runs on the CPU only.";

/** The option for a value, with its label and whether the tool can use it. */
function optionsWith(enabled: (value: RunOnValue) => boolean, autoLabel: string): RunOnOption[] {
  return RUN_ON_ORDER.map((value) => ({
    value,
    label: value === "auto" ? autoLabel : RUN_ON_LABELS[value],
    enabled: enabled(value),
  }));
}

/**
 * The choice a device name stands for: its kind, or Auto when the name is auto or no listed device
 * has it. An `other` device has no choice of its own, so it reads as Auto too.
 */
export function runOnValueOf(device: string, devices: PlaygroundDevice[]): RunOnValue {
  const kind = devices.find((candidate) => candidate.name === device)?.kind;
  if (kind === "cpu" || kind === "gpu" || kind === "npu") return kind;
  return "auto";
}

/** The device name a choice writes to the image form: the first listed device of that kind, else auto. */
export function imageDeviceForRunOn(value: RunOnValue, devices: PlaygroundDevice[]): string {
  if (value === "auto") return DEVICE_AUTO;
  return devices.find((device) => device.kind === value)?.name ?? DEVICE_AUTO;
}

/** The line under an image tool's options: the experimental GPU warning or the CPU-only build note. */
function imageComputeHint(device: string, devices: PlaygroundDevice[]): string | null {
  if (isGpuSelection(device, devices)) return GPU_EXPERIMENTAL_HINT;
  return isCpuOnlyBuild(devices) ? CPU_ONLY_BUILD_HINT : null;
}

/**
 * The Run on row of the image tools (text to image, image to image). Options need the devices the
 * build lists; until they are read every option is off, and Auto is labelled with the CPU when the
 * build lists one.
 */
export function imageComputeRow(
  devices: PlaygroundDevice[] | null,
  device: string,
): ComputeRowView {
  const listed = devices ?? [];
  const available = (value: RunOnValue) =>
    devices !== null && (value === "auto" || listed.some((item) => item.kind === value));
  return {
    setting: "device",
    label: RUN_ON_LABEL,
    help: COMPUTE_HELP,
    value: runOnValueOf(device, listed),
    options: optionsWith(available, devices ? autoComputeLabel(devices) : RUN_ON_LABELS.auto),
    hint: devices ? imageComputeHint(device, devices) : null,
  };
}

/** A row for a tool that runs on the CPU only: the CPU is the one option on, and it cannot change. */
export function cpuOnlyRow(hint: string): ComputeRowView {
  return {
    setting: null,
    label: RUN_ON_LABEL,
    help: null,
    value: "cpu",
    options: optionsWith((value) => value === "cpu", RUN_ON_LABELS.auto),
    hint,
  };
}

/**
 * The two OCR rows: the language model's choice (all four) and the vision encoder's (NPU or CPU,
 * the two the encoder runs on).
 */
export function ocrComputeRows(settings: OcrComputeSettings): ComputeRowView[] {
  return [
    {
      setting: "ocrCompute",
      label: OCR_LANGUAGE_MODEL_LABEL,
      help: OCR_COMPUTE_HELP,
      value: settings.compute,
      options: optionsWith(() => true, RUN_ON_LABELS.auto),
      hint: null,
    },
    {
      setting: "ocrVision",
      label: OCR_VISION_LABEL,
      help: null,
      value: settings.visionCompute,
      options: optionsWith((value) => value === "npu" || value === "cpu", RUN_ON_LABELS.auto),
      hint: null,
    },
  ];
}

/** What the selector's compute section reads from the stores. */
export interface ComputeState {
  devices: PlaygroundDevice[] | null;
  /** The image form's device: "auto" or a device name. */
  device: string;
  ocr: OcrComputeSettings;
}

/**
 * The compute rows a tool shows in the selector, in order. The landing has none, since no tool is
 * chosen there. Speech and audio to audio run on the CPU only, like upscaling.
 */
export function computeRowsOf(
  toolId: PlaygroundToolId | null,
  state: ComputeState,
): ComputeRowView[] {
  switch (toolId) {
    case "playground-text-to-image":
    case "playground-image-to-image":
      return [imageComputeRow(state.devices, state.device)];
    case "playground-ocr":
      return ocrComputeRows(state.ocr);
    case "playground-image-upscaling":
      return [cpuOnlyRow(UPSCALE_CPU_ONLY_HINT)];
    case "playground-speech-to-text":
    case "playground-text-to-speech":
    case "playground-audio-to-audio":
      return [cpuOnlyRow(SPEECH_CPU_ONLY_HINT)];
    case null:
      return [];
  }
}
