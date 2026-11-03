import type {
  ComputeTarget,
  ImageJob,
  OcrComputeSettings,
  OcrJob,
  PlaygroundDevice,
  SpeechJob,
} from "../types";
import { DEVICE_AUTO } from "./playground";

/** Order of the chart lines and the legend rows. */
export const USAGE_TARGET_ORDER: readonly ComputeTarget[] = ["cpu", "gpu", "npu"];

export const USAGE_TARGET_LABEL: Record<ComputeTarget, string> = {
  cpu: "CPU",
  gpu: "GPU",
  npu: "NPU",
};

/** What the usage chart can follow. A source that is not running is null. */
export interface UsageSources {
  /** Compute target of the loaded GenieX model. Null when no model is loaded. Not used while an OCR job runs. */
  loadedCompute: ComputeTarget | null;
  /** The running text to image, image to image or upscaling job. */
  imageJob: ImageJob | null;
  /** The running speech job. Speech runs on CPU only. */
  speechJob: SpeechJob | null;
  /** The running OCR job. Its own compute choices decide the targets. */
  ocrJob: OcrJob | null;
  /** Devices the runtime reported. Null until they are read. */
  devices: PlaygroundDevice[] | null;
}

/** One reading per target, as the usage sampler reports it. Null when the host has no counter for it. */
export type TargetReadings = Record<ComputeTarget, number | null>;

/**
 * Targets a text to image or image to image job runs on. "auto" lets the runtime pick, so every
 * target is watched. A listed GPU or NPU is its own target. Any other device, including one the
 * runtime does not list, counts as CPU.
 */
export function generateTargets(
  device: string,
  devices: PlaygroundDevice[] | null,
): ComputeTarget[] {
  if (device === DEVICE_AUTO) return [...USAGE_TARGET_ORDER];
  const kind = devices?.find((d) => d.name === device)?.kind;
  return kind === "gpu" || kind === "npu" ? [kind] : ["cpu"];
}

/**
 * Targets an OCR job runs on. The language model's choice is a target, and "auto" lets the runtime
 * pick, so every target is watched (as for image Auto). The vision encoder adds its own target.
 */
export function ocrTargets(settings: OcrComputeSettings): ComputeTarget[] {
  const used = new Set<ComputeTarget>([settings.visionCompute]);
  if (settings.compute === "auto") {
    for (const target of USAGE_TARGET_ORDER) used.add(target);
  } else {
    used.add(settings.compute);
  }
  return USAGE_TARGET_ORDER.filter((target) => used.has(target));
}

/**
 * Targets the chart follows for the running jobs, in chart order. The loaded model's target counts
 * only while no OCR job runs: the OCR job's own compute choices decide where it runs.
 */
export function usageTargets(sources: UsageSources): ComputeTarget[] {
  const used = new Set<ComputeTarget>();
  const { imageJob, ocrJob } = sources;

  if (sources.loadedCompute && !ocrJob) used.add(sources.loadedCompute);

  if (imageJob) {
    const targets: ComputeTarget[] =
      imageJob.kind === "upscale" ? ["cpu"] : generateTargets(imageJob.device, sources.devices);
    for (const target of targets) used.add(target);
  }

  if (ocrJob) {
    for (const target of ocrTargets(ocrJob)) used.add(target);
  }

  if (sources.speechJob) used.add("cpu");

  return USAGE_TARGET_ORDER.filter((target) => used.has(target));
}

/** The targets that have a reading in this sample. A target the host has no counter for is left out. */
export function targetsWithReadings(
  targets: readonly ComputeTarget[],
  readings: TargetReadings,
): ComputeTarget[] {
  return targets.filter((target) => readings[target] !== null);
}
