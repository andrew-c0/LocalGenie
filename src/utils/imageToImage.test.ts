import { describe, expect, it } from "vitest";
import type { ImageForm, ImageModel } from "../types";
import {
  buildEditRequest,
  clampStrength,
  DEFAULT_STRENGTH,
  editBlockedReason,
  editPromptLabel,
  editSizeFor,
  formWithInputSize,
  imageToImageModels,
  inputBadgeLabel,
  inputFileName,
  isSupportedInputPath,
  STRENGTH_MAX,
  STRENGTH_MIN,
} from "./imageToImage";
import { DEFAULT_IMAGE_FORM } from "./playground";

const model = (overrides: Partial<ImageModel> = {}): ImageModel => ({
  id: "sd15",
  name: "SD 1.5",
  description: "",
  license: "",
  licenseUrl: "",
  totalBytes: 0,
  downloaded: true,
  files: [],
  defaults: { width: 512, height: 512, steps: 20, cfgScale: 7 },
  supportsNegativePrompt: true,
  cfgAdjustable: true,
  imageInput: "init",
  ...overrides,
});

const form: ImageForm = {
  ...DEFAULT_IMAGE_FORM,
  prompt: "  make it snowy  ",
  negativePrompt: " blurry ",
  seed: 42,
  randomSeed: false,
};

describe("imageToImageModels", () => {
  it("lists re-draw and edit models and leaves out text-only models", () => {
    const models = [
      model({ id: "sd15", imageInput: "init" }),
      model({ id: "klein", imageInput: "reference" }),
      model({ id: "turbo", imageInput: "none" }),
    ];
    expect(imageToImageModels(models).map((m) => m.id)).toEqual(["sd15", "klein"]);
  });
});

describe("input picture", () => {
  it("accepts PNG, JPG and JPEG in any case", () => {
    expect(isSupportedInputPath("C:\\pics\\cat.png")).toBe(true);
    expect(isSupportedInputPath("C:\\pics\\cat.JPG")).toBe(true);
    expect(isSupportedInputPath("/home/me/cat.jpeg")).toBe(true);
  });

  it("refuses other formats, BMP and WEBP included, and names without an extension", () => {
    expect(isSupportedInputPath("/home/me/cat.bmp")).toBe(false);
    expect(isSupportedInputPath("C:\\pics\\cat.webp")).toBe(false);
    expect(isSupportedInputPath("C:\\pics\\cat.gif")).toBe(false);
    expect(isSupportedInputPath("C:\\pics\\cat.png.txt")).toBe(false);
    expect(isSupportedInputPath("C:\\pics\\png")).toBe(false);
  });

  it("names the file for either slash style", () => {
    expect(inputFileName("C:\\pics\\cat.png")).toBe("cat.png");
    expect(inputFileName("/home/me/cat.png")).toBe("cat.png");
    expect(inputFileName("cat.png")).toBe("cat.png");
  });
});

describe("editSizeFor", () => {
  const native = { width: 512, height: 512 };

  it("keeps a square picture at the native size", () => {
    expect(editSizeFor({ width: 1000, height: 1000 }, native)).toEqual({ width: 512, height: 512 });
  });

  it("keeps the picture's wide shape with about the native pixel count, in multiples of 16", () => {
    expect(editSizeFor({ width: 1920, height: 1080 }, native)).toEqual({ width: 688, height: 384 });
  });

  it("keeps the picture's tall shape", () => {
    expect(editSizeFor({ width: 1080, height: 1920 }, native)).toEqual({ width: 384, height: 688 });
  });

  it("keeps each side inside the size limits", () => {
    expect(editSizeFor({ width: 1, height: 100 }, { width: 2048, height: 2048 })).toEqual({
      width: 64,
      height: 2048,
    });
  });

  it("falls back to the native size for a picture with no size", () => {
    expect(editSizeFor({ width: 0, height: 0 }, native)).toEqual(native);
  });
});

describe("formWithInputSize", () => {
  it("keeps the form as it is until the picture's size is known", () => {
    expect(formWithInputSize(form, null, { width: 512, height: 512 })).toBe(form);
  });

  it("sets the size from the picture and keeps the other fields", () => {
    const next = formWithInputSize(
      form,
      { width: 1920, height: 1080 },
      { width: 512, height: 512 },
    );
    expect(next).toMatchObject({ width: 688, height: 384, prompt: form.prompt, seed: 42 });
  });
});

describe("clampStrength", () => {
  it("keeps the strength between 0.05 and 1", () => {
    expect(clampStrength(2)).toBe(STRENGTH_MAX);
    expect(clampStrength(0)).toBe(STRENGTH_MIN);
    expect(clampStrength(DEFAULT_STRENGTH)).toBe(DEFAULT_STRENGTH);
  });
});

describe("buildEditRequest", () => {
  it("adds the input and the strength for a re-draw model, with trimmed prompts", () => {
    const request = buildEditRequest("edit-1", model(), form, "C:\\in.png", 0.4);
    expect(request).toMatchObject({
      jobId: "edit-1",
      modelId: "sd15",
      prompt: "make it snowy",
      negativePrompt: "blurry",
      seed: 42,
      inputPath: "C:\\in.png",
      strength: 0.4,
    });
  });

  it("sends no strength for an edit model", () => {
    const request = buildEditRequest(
      "edit-2",
      model({ id: "klein", imageInput: "reference" }),
      form,
      "C:\\in.png",
      0.4,
    );
    expect(request.inputPath).toBe("C:\\in.png");
    expect("strength" in request).toBe(false);
  });

  it("keeps the strength inside its range", () => {
    expect(buildEditRequest("edit-3", model(), form, "a.png", 3).strength).toBe(STRENGTH_MAX);
  });

  it("uses the model's fixed CFG scale, as text to image does", () => {
    const request = buildEditRequest(
      "edit-4",
      model({ cfgAdjustable: false, defaults: { width: 512, height: 512, steps: 4, cfgScale: 1 } }),
      { ...form, cfgScale: 9 },
      "a.png",
      0.6,
    );
    expect(request.cfgScale).toBe(1);
  });
});

describe("editBlockedReason", () => {
  const ready = {
    runtime: "installed" as const,
    model: model(),
    inputPath: "C:\\in.png",
    prompt: "snow",
    jobRunning: false,
  };

  it("lets the job run when everything is set", () => {
    expect(editBlockedReason(ready)).toBeNull();
  });

  it("asks for a model, then for a download", () => {
    expect(editBlockedReason({ ...ready, model: null })).toBe("Choose a model first.");
    expect(editBlockedReason({ ...ready, model: model({ downloaded: false }) })).toBe(
      "Download the model first.",
    );
  });

  it("asks for an input picture before a prompt", () => {
    expect(editBlockedReason({ ...ready, inputPath: null, prompt: "" })).toBe(
      "Choose an input image first.",
    );
  });

  it("asks for a prompt once the picture is chosen", () => {
    expect(editBlockedReason({ ...ready, prompt: "   " })).toBe("Write a prompt first.");
  });

  it("reports a running job and a missing runtime first", () => {
    expect(editBlockedReason({ ...ready, jobRunning: true, inputPath: null })).toBe(
      "An image is already being generated.",
    );
    expect(editBlockedReason({ ...ready, runtime: "missing", inputPath: null })).toBe(
      "Install stable-diffusion.cpp in Settings > Runtimes first.",
    );
  });
});

describe("badge and prompt labels", () => {
  it("labels a re-draw model and an edit model", () => {
    expect(inputBadgeLabel("init")).toBe("Re-draw");
    expect(inputBadgeLabel("reference")).toBe("Edit with instructions");
    expect(inputBadgeLabel("none")).toBeNull();
  });

  it("asks for an instruction from an edit model and a description from a re-draw model", () => {
    expect(editPromptLabel("reference")).toBe("What to change");
    expect(editPromptLabel("init")).toBe("Describe the new picture");
    expect(editPromptLabel(null)).toBe("Describe the new picture");
  });
});
