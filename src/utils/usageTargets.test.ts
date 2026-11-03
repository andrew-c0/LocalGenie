import { describe, expect, it } from "vitest";
import type { ImageJob, OcrJob, PlaygroundDevice, SpeechJob } from "../types";
import {
  generateTargets,
  ocrTargets,
  type TargetReadings,
  targetsWithReadings,
  usageTargets,
} from "./usageTargets";

const DEVICES: PlaygroundDevice[] = [
  { name: "gpu0", description: "Adreno GPU", kind: "gpu" },
  { name: "npu0", description: "Hexagon NPU", kind: "npu" },
  { name: "cpu0", description: "Oryon CPU", kind: "cpu" },
  { name: "weird0", description: "Unknown accelerator", kind: "other" },
];

function imageJob(overrides: Partial<ImageJob> = {}): ImageJob {
  return {
    jobId: "job-1",
    kind: "generate",
    modelId: "sd-model",
    device: "auto",
    inputPath: null,
    startedAt: 0,
    phase: "sampling",
    step: 1,
    steps: 20,
    secondsPerStep: null,
    ...overrides,
  };
}

function speechJob(): SpeechJob {
  return { jobId: "speech-1", kind: "tts", modelId: "tts-model", startedAt: 0, phase: "running" };
}

function ocrJob(overrides: Partial<OcrJob> = {}): OcrJob {
  return {
    jobId: "ocr-1",
    modelId: "ocr-model",
    startedAt: 0,
    compute: "cpu",
    visionCompute: "npu",
    ...overrides,
  };
}

const NO_SOURCES = {
  loadedCompute: null,
  imageJob: null,
  speechJob: null,
  ocrJob: null,
  devices: DEVICES,
};

describe("generateTargets", () => {
  it("watches every target for auto", () => {
    expect(generateTargets("auto", DEVICES)).toEqual(["cpu", "gpu", "npu"]);
  });

  it("watches the GPU for a listed GPU", () => {
    expect(generateTargets("gpu0", DEVICES)).toEqual(["gpu"]);
  });

  it("watches the NPU for a listed NPU", () => {
    expect(generateTargets("npu0", DEVICES)).toEqual(["npu"]);
  });

  it("counts an unknown or other-kind device as CPU", () => {
    expect(generateTargets("weird0", DEVICES)).toEqual(["cpu"]);
    expect(generateTargets("missing", DEVICES)).toEqual(["cpu"]);
    expect(generateTargets("gpu0", null)).toEqual(["cpu"]);
  });
});

describe("ocrTargets", () => {
  it("watches the language model's CPU and the vision encoder's NPU", () => {
    expect(ocrTargets({ compute: "cpu", visionCompute: "npu" })).toEqual(["cpu", "npu"]);
  });

  it("watches every target for an auto language model", () => {
    expect(ocrTargets({ compute: "auto", visionCompute: "npu" })).toEqual(["cpu", "gpu", "npu"]);
  });

  it("lists the language model's and the encoder's targets in chart order", () => {
    expect(ocrTargets({ compute: "gpu", visionCompute: "cpu" })).toEqual(["cpu", "gpu"]);
  });
});

describe("usageTargets", () => {
  it("returns no targets with no job and no model", () => {
    expect(usageTargets(NO_SOURCES)).toEqual([]);
  });

  it("follows the OCR job's language model and vision encoder", () => {
    expect(usageTargets({ ...NO_SOURCES, ocrJob: ocrJob() })).toEqual(["cpu", "npu"]);
  });

  it("shows all three targets for an OCR job with an auto language model and an NPU encoder", () => {
    const sources = { ...NO_SOURCES, ocrJob: ocrJob({ compute: "auto", visionCompute: "npu" }) };
    expect(usageTargets(sources)).toEqual(["cpu", "gpu", "npu"]);
  });

  it("ignores the loaded model's target while an OCR job runs", () => {
    const sources = { ...NO_SOURCES, loadedCompute: "gpu" as const, ocrJob: ocrJob() };
    expect(usageTargets(sources)).toEqual(["cpu", "npu"]);
  });

  it("keeps the loaded model's target with no OCR job", () => {
    const sources = { ...NO_SOURCES, loadedCompute: "gpu" as const, ocrJob: null };
    expect(usageTargets(sources)).toEqual(["gpu"]);
  });

  it("follows the GPU for a text to image job on a GPU", () => {
    expect(usageTargets({ ...NO_SOURCES, imageJob: imageJob({ device: "gpu0" }) })).toEqual([
      "gpu",
    ]);
  });

  it("shows all three targets for an auto image job", () => {
    expect(usageTargets({ ...NO_SOURCES, imageJob: imageJob({ device: "auto" }) })).toEqual([
      "cpu",
      "gpu",
      "npu",
    ]);
  });

  it("uses the CPU for an upscaling job, whatever device it names", () => {
    const upscale = imageJob({ kind: "upscale", device: "gpu0" });
    expect(usageTargets({ ...NO_SOURCES, imageJob: upscale })).toEqual(["cpu"]);
  });

  it("uses the CPU for a speech job", () => {
    expect(usageTargets({ ...NO_SOURCES, speechJob: speechJob() })).toEqual(["cpu"]);
  });

  it("adds the loaded model's target to the job's target", () => {
    const sources = {
      ...NO_SOURCES,
      loadedCompute: "npu" as const,
      imageJob: imageJob({ device: "gpu0" }),
    };
    expect(usageTargets(sources)).toEqual(["gpu", "npu"]);
  });

  it("returns only the loaded model's target when no job runs", () => {
    expect(usageTargets({ ...NO_SOURCES, loadedCompute: "gpu" })).toEqual(["gpu"]);
  });

  it("lists each target once, in chart order", () => {
    const sources = {
      ...NO_SOURCES,
      loadedCompute: "cpu" as const,
      imageJob: imageJob({ device: "auto" }),
      speechJob: speechJob(),
    };
    expect(usageTargets(sources)).toEqual(["cpu", "gpu", "npu"]);
  });
});

describe("targetsWithReadings", () => {
  const readings: TargetReadings = { cpu: 40, gpu: null, npu: 0 };

  it("keeps the targets that have a reading, in the order given", () => {
    expect(targetsWithReadings(["cpu", "gpu", "npu"], readings)).toEqual(["cpu", "npu"]);
  });

  it("keeps a reading of zero", () => {
    expect(targetsWithReadings(["npu"], readings)).toEqual(["npu"]);
  });

  it("returns nothing when no target has a reading", () => {
    expect(targetsWithReadings(["gpu"], readings)).toEqual([]);
  });
});
