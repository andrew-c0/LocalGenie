import { describe, expect, it } from "vitest";
import type { ImageForm, ImageModel, PlaygroundDevice, PlaygroundDownloadProgress } from "../types";
import {
  applyModelDefaults,
  autoComputeLabel,
  buildImageRequest,
  byteProgressLabel,
  computeOptions,
  DEFAULT_IMAGE_FORM,
  DEVICE_AUTO,
  defaultImageModel,
  deviceForRequest,
  deviceKindLabel,
  deviceOptionLabel,
  deviceSummaryLabel,
  downloadProgressLabel,
  formatElapsed,
  freedBytesOnDelete,
  generateBlockedReason,
  generationEtaLabel,
  generationPhaseRows,
  imageFormControls,
  imagePhaseLabel,
  imageSizeError,
  isCpuOnlyBuild,
  isGpuSelection,
  jobProgressPercent,
  keepDeviceSelection,
  overallDownloadPercent,
  sizeHintText,
  sizePresetOptions,
  snapImageSize,
} from "./playground";

const MB = 1_048_576;

const progress = (overrides: Partial<PlaygroundDownloadProgress>): PlaygroundDownloadProgress => ({
  modelId: "sdxl-turbo",
  fileName: "model.safetensors",
  fileIndex: 0,
  fileCount: 1,
  received: 0,
  total: 0,
  ...overrides,
});

const model = (overrides: Partial<ImageModel> = {}): ImageModel => ({
  id: "sdxl-turbo",
  name: "SDXL Turbo",
  description: "Fast text to image",
  license: "CreativeML Open RAIL++-M",
  licenseUrl: "https://example.com/license",
  totalBytes: 2 * 1_073_741_824,
  downloaded: false,
  files: [],
  defaults: { width: 512, height: 512, steps: 4, cfgScale: 1 },
  supportsNegativePrompt: true,
  cfgAdjustable: true,
  imageInput: "none",
  ...overrides,
});

const device = (overrides: Partial<PlaygroundDevice> = {}): PlaygroundDevice => ({
  name: "GPU0",
  description: "Qualcomm Adreno X1-85",
  kind: "gpu",
  ...overrides,
});

const CPU = device({ name: "CPU0", description: "Snapdragon X Elite", kind: "cpu" });
const NPU = device({ name: "NPU0", description: "Hexagon", kind: "npu" });

const job = (overrides: Partial<Parameters<typeof generationEtaLabel>[0]>) => ({
  phase: "sampling" as const,
  step: 0,
  steps: 4,
  secondsPerStep: null,
  ...overrides,
});

describe("overallDownloadPercent", () => {
  it("counts the current file's share on top of the files already finished", () => {
    // Second of four files, halfway through it: (1 + 0.5) / 4 = 37.5%, rounded to 38.
    expect(
      overallDownloadPercent(progress({ fileIndex: 1, fileCount: 4, received: 50, total: 100 })),
    ).toBe(38);
  });

  it("is the current file's share alone for a single-file model", () => {
    expect(
      overallDownloadPercent(progress({ fileIndex: 0, fileCount: 1, received: 1, total: 4 })),
    ).toBe(25);
  });

  it("is 100 once the last file is complete", () => {
    expect(
      overallDownloadPercent(progress({ fileIndex: 2, fileCount: 3, received: 10, total: 10 })),
    ).toBe(100);
  });

  it("is null while the current file's size is unknown, so the bar is indeterminate", () => {
    expect(
      overallDownloadPercent(progress({ fileIndex: 1, fileCount: 3, received: 500, total: 0 })),
    ).toBeNull();
  });

  it("is null when there are no files to count", () => {
    expect(overallDownloadPercent(progress({ fileCount: 0, received: 1, total: 2 }))).toBeNull();
  });

  it("clamps when more bytes arrive than the total reports", () => {
    expect(
      overallDownloadPercent(progress({ fileIndex: 0, fileCount: 1, received: 120, total: 100 })),
    ).toBe(100);
  });
});

describe("size labels", () => {
  it("shows received and total bytes", () => {
    expect(byteProgressLabel(12 * MB, 63 * MB)).toBe("12.0 MB of 63.0 MB");
  });

  it("shows only the received bytes when the total is unknown", () => {
    expect(byteProgressLabel(12 * MB, 0)).toBe("12.0 MB");
  });
});

describe("downloadProgressLabel", () => {
  it("says the download is starting before the first event", () => {
    expect(downloadProgressLabel(null)).toBe("Starting download…");
  });

  it("names the file, its place in the list and the bytes for a multi-file model", () => {
    const label = downloadProgressLabel(
      progress({
        fileName: "unet.safetensors",
        fileIndex: 1,
        fileCount: 3,
        received: 12 * MB,
        total: 63 * MB,
      }),
    );
    expect(label).toBe("Downloading unet.safetensors (file 2 of 3): 12.0 MB of 63.0 MB");
  });

  it("leaves out the file place for a single-file model", () => {
    expect(downloadProgressLabel(progress({ received: 5 * MB, total: 0 }))).toBe(
      "Downloading model.safetensors: 5.0 MB",
    );
  });
});

describe("generation phases", () => {
  it("marks the stages before the active one as done and the ones after as pending", () => {
    const rows = generationPhaseRows({ phase: "sampling", step: 3, steps: 4, secondsPerStep: 2 });
    expect(rows.map((row) => row.status)).toEqual(["done", "done", "active", "pending", "pending"]);
    expect(rows[2]?.label).toBe("Generating step 3 of 4");
  });

  it("starts with loading as the active stage", () => {
    const rows = generationPhaseRows({ phase: "loading", step: 0, steps: 4, secondsPerStep: null });
    expect(rows.map((row) => row.status)).toEqual([
      "active",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    expect(rows[0]?.label).toBe("Loading model");
  });

  it("marks every stage done once saving is the active one", () => {
    const rows = generationPhaseRows({ phase: "saving", step: 4, steps: 4, secondsPerStep: 2 });
    expect(rows.slice(0, 4).every((row) => row.status === "done")).toBe(true);
    expect(rows[4]).toMatchObject({ label: "Saving", status: "active" });
  });

  it("says Generating image before the first sampling step", () => {
    expect(imagePhaseLabel("sampling", 0, 20)).toBe("Generating image");
    expect(imagePhaseLabel("sampling", 3, 20)).toBe("Generating step 3 of 20");
    expect(imagePhaseLabel("decoding", 20, 20)).toBe("Decoding image");
  });
});

describe("generation percent", () => {
  it("is the share of sampling steps finished", () => {
    expect(jobProgressPercent(job({ step: 5, steps: 20 }))).toBe(25);
    expect(jobProgressPercent(job({ step: 20, steps: 20 }))).toBe(100);
  });

  it("is null outside sampling, so the bar is indeterminate there", () => {
    expect(jobProgressPercent(job({ phase: "loading", step: 0 }))).toBeNull();
    expect(jobProgressPercent(job({ phase: "decoding", step: 4 }))).toBeNull();
    expect(jobProgressPercent(job({ phase: "saving", step: 4 }))).toBeNull();
  });

  it("is null while the step count is unknown", () => {
    expect(jobProgressPercent(job({ steps: 0 }))).toBeNull();
  });
});

describe("generation eta", () => {
  it("gives the step time and the time left from the steps still to run", () => {
    // 7 steps left at 2.5 s is 17.5 s, rounded to 18.
    expect(generationEtaLabel(job({ step: 3, steps: 10, secondsPerStep: 2.5 }))).toBe(
      "about 2.5 s per step, ~18 s left",
    );
  });

  it("is null until a step time is measured", () => {
    expect(generationEtaLabel(job({ step: 0, secondsPerStep: null }))).toBeNull();
  });

  it("is null outside sampling", () => {
    expect(generationEtaLabel(job({ phase: "decoding", secondsPerStep: 2 }))).toBeNull();
  });

  it("never shows a negative time left", () => {
    expect(generationEtaLabel(job({ step: 6, steps: 4, secondsPerStep: 2 }))).toBe(
      "about 2.0 s per step, ~0 s left",
    );
  });
});

describe("formatElapsed", () => {
  it("formats elapsed time as minutes and seconds", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(9_999)).toBe("0:09");
    expect(formatElapsed(-500)).toBe("0:00");
  });
});

describe("size validation", () => {
  it("accepts whole multiples of 8 within 64 to 2048", () => {
    expect(imageSizeError("Width", "64")).toBeNull();
    expect(imageSizeError("Width", "504")).toBeNull();
    expect(imageSizeError("Height", "2048")).toBeNull();
    expect(imageSizeError("Height", " 768 ")).toBeNull();
  });

  it("names the nearest valid size when the value is off the step of 8", () => {
    expect(imageSizeError("Width", "500")).toBe("Width must be a multiple of 8. Nearest is 504.");
  });

  it("rejects values outside the range", () => {
    expect(imageSizeError("Height", "32")).toBe("Height must be between 64 and 2048.");
    expect(imageSizeError("Height", "4096")).toBe("Height must be between 64 and 2048.");
  });

  it("rejects blank text and anything that is not a whole number", () => {
    expect(imageSizeError("Width", "")).toBe("Width must be a whole number.");
    expect(imageSizeError("Width", "abc")).toBe("Width must be a whole number.");
    expect(imageSizeError("Width", "512.5")).toBe("Width must be a whole number.");
  });

  it("checks the step the caller gives, such as 16 for edit models", () => {
    expect(imageSizeError("Width", "504", 16)).toBe(
      "Width must be a multiple of 16. Nearest is 512.",
    );
    expect(imageSizeError("Width", "528", 16)).toBeNull();
    expect(imageSizeError("Width", "504")).toBeNull();
  });
});

describe("size snapping", () => {
  it("rounds to the nearest multiple of 8", () => {
    expect(snapImageSize("500", 512)).toBe(504);
    expect(snapImageSize("515", 512)).toBe(512);
    expect(snapImageSize(" 768 ", 512)).toBe(768);
  });

  it("clamps to the range", () => {
    expect(snapImageSize("10", 512)).toBe(64);
    expect(snapImageSize("99999", 512)).toBe(2048);
  });

  it("gives the fallback for blank or non-number text", () => {
    expect(snapImageSize("", 512)).toBe(512);
    expect(snapImageSize("abc", 768)).toBe(768);
  });
});

describe("size presets and hint", () => {
  it("offers the four fixed presets when the model's size is one of them", () => {
    expect(sizePresetOptions({ width: 512, height: 512 })).toEqual([
      { width: 512, height: 512, label: "512 x 512 (model default)" },
      { width: 512, height: 768, label: "512 x 768" },
      { width: 768, height: 512, label: "768 x 512" },
      { width: 768, height: 768, label: "768 x 768" },
    ]);
  });

  it("adds the model's own size as a fifth preset when it is not one of them", () => {
    const presets = sizePresetOptions({ width: 1024, height: 1024 });
    expect(presets).toHaveLength(5);
    expect(presets[4]).toMatchObject({
      width: 1024,
      height: 1024,
      label: "1024 x 1024 (model default)",
    });
  });

  it("has no model default label without a model", () => {
    expect(sizePresetOptions(null).map((preset) => preset.label)).toEqual([
      "512 x 512",
      "512 x 768",
      "768 x 512",
      "768 x 768",
    ]);
  });

  it("names the native size in the hint, or gives the general hint without a model", () => {
    expect(sizeHintText({ width: 768, height: 768 })).toContain("(768 x 768)");
    expect(sizeHintText(null)).toBe(
      "Models work best near their native size. Other sizes are allowed but may look worse and are slower.",
    );
  });
});

describe("form controls", () => {
  it("locks nothing when there is no model", () => {
    expect(imageFormControls(null)).toEqual({ negativePromptReason: null, cfgReason: null });
  });

  it("locks the negative prompt for a model that ignores it", () => {
    expect(imageFormControls(model({ supportsNegativePrompt: false })).negativePromptReason).toBe(
      "This model does not use a negative prompt.",
    );
    expect(imageFormControls(model()).negativePromptReason).toBeNull();
  });

  it("locks the CFG scale at the model's value when it is not adjustable", () => {
    expect(imageFormControls(model({ cfgAdjustable: false })).cfgReason).toBe(
      "Fixed at 1 for this model.",
    );
    expect(imageFormControls(model()).cfgReason).toBeNull();
  });
});

describe("form helpers", () => {
  it("keeps the prompt and seed when a model's defaults are applied", () => {
    const form: ImageForm = { ...DEFAULT_IMAGE_FORM, prompt: "a fox", seed: 7 };
    const next = applyModelDefaults(form, {
      width: 768,
      height: 768,
      steps: 4,
      cfgScale: 1,
    });
    expect(next).toMatchObject({ prompt: "a fox", seed: 7, width: 768, steps: 4, cfgScale: 1 });
  });

  it("sends seed -1 for a random seed and trims the prompts", () => {
    const request = buildImageRequest(
      "img-1",
      model({ id: "sdxl-turbo", supportsNegativePrompt: true }),
      {
        ...DEFAULT_IMAGE_FORM,
        prompt: "  a fox  ",
        negativePrompt: "   ",
        randomSeed: true,
        seed: 42,
      },
    );
    expect(request).toMatchObject({ prompt: "a fox", seed: -1, modelId: "sdxl-turbo" });
    expect(request.negativePrompt).toBeUndefined();
  });

  it("sends the typed seed when random is off", () => {
    const request = buildImageRequest("img-2", model(), {
      ...DEFAULT_IMAGE_FORM,
      negativePrompt: " blurry ",
      randomSeed: false,
      seed: 42,
    });
    expect(request).toMatchObject({ seed: 42, negativePrompt: "blurry" });
  });

  it("leaves the negative prompt out for a model that ignores it", () => {
    const request = buildImageRequest("img-3", model({ supportsNegativePrompt: false }), {
      ...DEFAULT_IMAGE_FORM,
      negativePrompt: "blurry",
    });
    expect(request.negativePrompt).toBeUndefined();
  });

  it("sends the model's CFG scale when the model fixes it", () => {
    const request = buildImageRequest(
      "img-4",
      model({ cfgAdjustable: false, defaults: { width: 512, height: 512, steps: 4, cfgScale: 1 } }),
      { ...DEFAULT_IMAGE_FORM, cfgScale: 7 },
    );
    expect(request.cfgScale).toBe(1);
  });
});

describe("defaultImageModel", () => {
  it("prefers the first downloaded model", () => {
    const models = [model({ id: "a" }), model({ id: "b", downloaded: true })];
    expect(defaultImageModel(models)?.id).toBe("b");
  });

  it("falls back to the first model, and null when there are none", () => {
    expect(defaultImageModel([model({ id: "a" })])?.id).toBe("a");
    expect(defaultImageModel([])).toBeNull();
  });
});

describe("generateBlockedReason", () => {
  const ready = {
    runtime: "installed" as const,
    model: model({ downloaded: true }),
    prompt: "a fox",
    jobRunning: false,
  };

  it("is null when every condition holds", () => {
    expect(generateBlockedReason(ready)).toBeNull();
  });

  it("names the first unmet condition", () => {
    expect(generateBlockedReason({ ...ready, jobRunning: true })).toBe(
      "An image is already being generated.",
    );
    expect(generateBlockedReason({ ...ready, runtime: "checking" })).toBe("Checking the runtime…");
    expect(generateBlockedReason({ ...ready, runtime: "failed" })).toBe(
      "Could not check the runtime.",
    );
    expect(generateBlockedReason({ ...ready, runtime: "missing" })).toBe(
      "Install stable-diffusion.cpp in Settings > Runtimes first.",
    );
    expect(generateBlockedReason({ ...ready, model: null })).toBe("Choose a model first.");
    expect(generateBlockedReason({ ...ready, model: model() })).toBe("Download the model first.");
    expect(generateBlockedReason({ ...ready, prompt: "   " })).toBe("Write a prompt first.");
  });
});

describe("device labels", () => {
  it("names the kind and the description", () => {
    expect(deviceOptionLabel(CPU)).toBe("CPU – Snapdragon X Elite");
    expect(deviceOptionLabel(device())).toBe("GPU – Qualcomm Adreno X1-85");
    expect(deviceOptionLabel(NPU)).toBe("NPU – Hexagon");
  });

  it("shows only the kind when the device has no description", () => {
    expect(deviceOptionLabel(device({ description: "  " }))).toBe("GPU");
  });

  it("gives the kind label for every kind", () => {
    expect(deviceKindLabel("cpu")).toBe("CPU");
    expect(deviceKindLabel("gpu")).toBe("GPU");
    expect(deviceKindLabel("npu")).toBe("NPU");
    expect(deviceKindLabel("other")).toBe("Other");
  });

  it("lists Auto first, then one entry per device", () => {
    expect(computeOptions([CPU, NPU])).toEqual([
      { value: DEVICE_AUTO, label: "Auto (CPU)" },
      { value: "CPU0", label: "CPU – Snapdragon X Elite" },
      { value: "NPU0", label: "NPU – Hexagon" },
    ]);
  });

  it("lists only Auto when no device is reported", () => {
    expect(computeOptions([])).toEqual([{ value: DEVICE_AUTO, label: "Auto" }]);
  });

  it("labels Auto as the CPU only when the build lists a CPU", () => {
    expect(autoComputeLabel([CPU])).toBe("Auto (CPU)");
    expect(autoComputeLabel([CPU, device()])).toBe("Auto (CPU)");
    expect(autoComputeLabel([device()])).toBe("Auto");
    expect(autoComputeLabel([NPU])).toBe("Auto");
    expect(autoComputeLabel([])).toBe("Auto");
  });

  it("does not treat an other-kind device as a CPU", () => {
    expect(autoComputeLabel([device({ kind: "other" })])).toBe("Auto");
  });

  it("keeps Auto as the label of its own option when there is no CPU", () => {
    expect(computeOptions([device()])[0]).toEqual({ value: DEVICE_AUTO, label: "Auto" });
  });

  it("names the auto choice and the listed device in the result summary", () => {
    expect(deviceSummaryLabel(DEVICE_AUTO, [CPU])).toBe("Auto (CPU)");
    expect(deviceSummaryLabel("CPU0", [CPU])).toBe("CPU – Snapdragon X Elite");
  });

  it("falls back to the raw device name when the device is no longer listed", () => {
    expect(deviceSummaryLabel("GPU0", [CPU])).toBe("GPU0");
  });
});

describe("device selection", () => {
  it("is left out of the request for auto", () => {
    expect(deviceForRequest(DEVICE_AUTO)).toBeUndefined();
    expect(deviceForRequest("GPU0")).toBe("GPU0");
  });

  it("is sent with the request only when a device is chosen", () => {
    const withDevice = buildImageRequest("img-5", model(), {
      ...DEFAULT_IMAGE_FORM,
      device: "GPU0",
    });
    expect(withDevice.device).toBe("GPU0");

    const withAuto = buildImageRequest("img-6", model(), DEFAULT_IMAGE_FORM);
    expect(withAuto.device).toBeUndefined();
  });

  it("keeps a selection that is still listed", () => {
    expect(keepDeviceSelection("CPU0", [CPU, NPU])).toBe("CPU0");
  });

  it("falls back to auto when the selected device disappears", () => {
    expect(keepDeviceSelection("GPU0", [CPU, NPU])).toBe(DEVICE_AUTO);
    expect(keepDeviceSelection("GPU0", [])).toBe(DEVICE_AUTO);
  });

  it("keeps auto whatever the list holds", () => {
    expect(keepDeviceSelection(DEVICE_AUTO, [])).toBe(DEVICE_AUTO);
  });
});

describe("GPU selection", () => {
  it("is true only when the selection is a listed GPU", () => {
    expect(isGpuSelection("GPU0", [CPU, device()])).toBe(true);
    expect(isGpuSelection("CPU0", [CPU, device()])).toBe(false);
    expect(isGpuSelection(DEVICE_AUTO, [CPU, device()])).toBe(false);
  });

  it("is false for a GPU that is no longer listed", () => {
    expect(isGpuSelection("GPU0", [CPU])).toBe(false);
  });
});

describe("CPU-only builds", () => {
  it("is true when the build lists only the CPU", () => {
    expect(isCpuOnlyBuild([CPU])).toBe(true);
  });

  it("is false when a GPU or NPU is listed too", () => {
    expect(isCpuOnlyBuild([CPU, device()])).toBe(false);
    expect(isCpuOnlyBuild([NPU])).toBe(false);
  });

  it("is false for an empty list, which says nothing about the build", () => {
    expect(isCpuOnlyBuild([])).toBe(false);
  });
});

describe("freed size on delete", () => {
  const file = (fileName: string, sizeBytes: number) => ({ fileName, sizeBytes, present: true });

  const qwen = (overrides: Partial<ImageModel> = {}) =>
    model({
      id: "qwen-image",
      name: "Qwen Image",
      downloaded: true,
      files: [file("qwen.safetensors", 4 * MB), file("vae.safetensors", 1 * MB)],
      ...overrides,
    });

  const zImage = (overrides: Partial<ImageModel> = {}) =>
    model({
      id: "z-image",
      name: "Z-Image",
      downloaded: true,
      files: [file("z.safetensors", 3 * MB), file("vae.safetensors", 1 * MB)],
      ...overrides,
    });

  it("counts every file when no other downloaded model shares one", () => {
    const models = [qwen(), model({ id: "other", downloaded: false, files: [] })];
    expect(freedBytesOnDelete(qwen(), models)).toBe(5 * MB);
  });

  it("leaves out a file that another downloaded model also uses", () => {
    const models = [qwen(), zImage()];
    expect(freedBytesOnDelete(qwen(), models)).toBe(4 * MB);
    expect(freedBytesOnDelete(zImage(), models)).toBe(3 * MB);
  });

  it("counts a shared file again once the other model is not downloaded", () => {
    const models = [qwen(), zImage({ downloaded: false })];
    expect(freedBytesOnDelete(qwen(), models)).toBe(5 * MB);
  });

  it("matches files by name only", () => {
    const models = [qwen(), zImage({ files: [file("qwen.safetensors", 9 * MB)] })];
    expect(freedBytesOnDelete(qwen(), models)).toBe(1 * MB);
  });
});
