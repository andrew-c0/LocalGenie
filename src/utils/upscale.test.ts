import { describe, expect, it } from "vitest";
import type { ImageJob, ImageResult, UpscaleModel } from "../types";
import {
  buildUpscaleRequest,
  defaultUpscaleModel,
  isOversizedInput,
  jobOfKind,
  oversizedInputWarning,
  resultOfKind,
  UPSCALE_INPUT_MAX_SIDE,
  upscaleBlockedReason,
  upscalePhaseLabel,
} from "./upscale";

const model = (overrides: Partial<UpscaleModel> = {}): UpscaleModel => ({
  id: "realesrgan-x4plus-anime-6b",
  name: "Real-ESRGAN",
  description: "",
  license: "BSD-3-Clause",
  licenseUrl: "",
  sizeBytes: 1,
  downloaded: true,
  bestFor: "Illustrations and anime",
  ...overrides,
});

const job: ImageJob = {
  jobId: "img-1",
  kind: "upscale",
  modelId: "m",
  device: "auto",
  inputPath: "C:/in.png",
  startedAt: 0,
  phase: "loading",
  step: 0,
  steps: 0,
  secondsPerStep: null,
};

const result: ImageResult = {
  jobId: "img-1",
  kind: "generate",
  status: "done",
  path: null,
  error: null,
  seed: null,
  seconds: null,
  device: "auto",
  inputPath: null,
};

describe("defaultUpscaleModel", () => {
  it("prefers a downloaded model, else the first", () => {
    const a = model({ id: "a", downloaded: false });
    const b = model({ id: "b", downloaded: true });
    expect(defaultUpscaleModel([a, b])?.id).toBe("b");
    expect(defaultUpscaleModel([a])?.id).toBe("a");
    expect(defaultUpscaleModel([])).toBeNull();
  });
});

describe("input size limit", () => {
  it("flags only a longest side above the limit", () => {
    expect(isOversizedInput({ width: UPSCALE_INPUT_MAX_SIDE, height: 10 })).toBe(false);
    expect(isOversizedInput({ width: 10, height: UPSCALE_INPUT_MAX_SIDE + 1 })).toBe(true);
  });

  it("warns with the picture's size, and not when the size is unknown", () => {
    expect(oversizedInputWarning(null)).toBeNull();
    expect(oversizedInputWarning({ width: 256, height: 256 })).toBeNull();
    expect(oversizedInputWarning({ width: 2000, height: 900 })).toContain("2000 x 900");
  });
});

describe("buildUpscaleRequest", () => {
  it("carries the job, model and picture", () => {
    expect(buildUpscaleRequest("j", model({ id: "m" }), "C:/in.png")).toEqual({
      jobId: "j",
      modelId: "m",
      inputPath: "C:/in.png",
    });
  });
});

describe("upscaleBlockedReason", () => {
  const ready = {
    runtime: "installed" as const,
    model: model(),
    inputPath: "C:/in.png",
    jobRunning: false,
  };

  it("is null when everything is in place", () => {
    expect(upscaleBlockedReason(ready)).toBeNull();
  });

  it("names the first thing to fix", () => {
    expect(upscaleBlockedReason({ ...ready, jobRunning: true, model: null })).toMatch(/already/);
    expect(upscaleBlockedReason({ ...ready, runtime: "missing" })).toMatch(/Settings > Runtimes/);
    expect(upscaleBlockedReason({ ...ready, model: null })).toMatch(/model/);
    expect(upscaleBlockedReason({ ...ready, model: model({ downloaded: false }) })).toMatch(
      /Download/,
    );
    expect(upscaleBlockedReason({ ...ready, inputPath: null })).toMatch(/input image/);
  });
});

describe("job and result kinds", () => {
  it("returns the job or result only for its own kind", () => {
    expect(jobOfKind(job, "upscale")).toBe(job);
    expect(jobOfKind(job, "generate")).toBeNull();
    expect(jobOfKind(null, "upscale")).toBeNull();
    expect(resultOfKind(result, "generate")).toBe(result);
    expect(resultOfKind(result, "upscale")).toBeNull();
  });
});

describe("upscalePhaseLabel", () => {
  it("names the stage, and the part once the runtime counts them", () => {
    expect(upscalePhaseLabel({ phase: "loading", step: 0, steps: 0, secondsPerStep: null })).toBe(
      "Loading model",
    );
    expect(upscalePhaseLabel({ phase: "sampling", step: 0, steps: 6, secondsPerStep: null })).toBe(
      "Upscaling",
    );
    expect(upscalePhaseLabel({ phase: "sampling", step: 2, steps: 6, secondsPerStep: 1 })).toBe(
      "Upscaling part 2 of 6",
    );
  });
});
