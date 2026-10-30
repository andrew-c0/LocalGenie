import { beforeEach, describe, expect, it } from "vitest";
import type { ImageModel, PlaygroundDevice, UpscaleModel } from "../types";
import { DEFAULT_IMAGE_FORM, DEVICE_AUTO } from "../utils/playground";
import { usePlaygroundStore } from "./playgroundStore";

const model = (id: string, overrides: Partial<ImageModel> = {}): ImageModel => ({
  id,
  name: id,
  description: "",
  license: "",
  licenseUrl: "",
  totalBytes: 0,
  downloaded: false,
  files: [],
  defaults: { width: 512, height: 512, steps: 4, cfgScale: 1 },
  supportsNegativePrompt: true,
  cfgAdjustable: true,
  imageInput: "none",
  ...overrides,
});

const GPU: PlaygroundDevice = { name: "GPU0", description: "Adreno", kind: "gpu" };
const CPU: PlaygroundDevice = { name: "CPU0", description: "Oryon", kind: "cpu" };

beforeEach(() => {
  usePlaygroundStore.setState({
    models: null,
    selectedModelId: null,
    devices: null,
    form: DEFAULT_IMAGE_FORM,
    downloads: {},
    job: null,
    result: null,
  });
});

describe("setDevices", () => {
  it("stores the devices", () => {
    usePlaygroundStore.getState().setDevices([CPU, GPU]);
    expect(usePlaygroundStore.getState().devices).toEqual([CPU, GPU]);
  });

  it("keeps a device choice that is still listed", () => {
    usePlaygroundStore.setState({ form: { ...DEFAULT_IMAGE_FORM, device: "GPU0" } });
    usePlaygroundStore.getState().setDevices([CPU, GPU]);
    expect(usePlaygroundStore.getState().form.device).toBe("GPU0");
  });

  it("falls back to auto when the chosen device disappears", () => {
    usePlaygroundStore.setState({ form: { ...DEFAULT_IMAGE_FORM, device: "GPU0" } });
    usePlaygroundStore.getState().setDevices([CPU]);
    expect(usePlaygroundStore.getState().form.device).toBe(DEVICE_AUTO);
  });
});

describe("replaceModelsAfterDelete", () => {
  it("clears the selection when the deleted model was selected", () => {
    const deleted = model("qwen", { downloaded: true });
    usePlaygroundStore.setState({ selectedModelId: "qwen" });
    usePlaygroundStore
      .getState()
      .replaceModelsAfterDelete([{ ...deleted, downloaded: false }, model("z")], "qwen");
    expect(usePlaygroundStore.getState().selectedModelId).toBeNull();
  });

  it("keeps the selection when another model was deleted", () => {
    usePlaygroundStore.setState({ selectedModelId: "z" });
    usePlaygroundStore.getState().replaceModelsAfterDelete([model("qwen"), model("z")], "qwen");
    expect(usePlaygroundStore.getState().selectedModelId).toBe("z");
  });
});

describe("finishJob", () => {
  it("attaches the job's device to the result", () => {
    usePlaygroundStore.setState({
      job: {
        jobId: "img-1",
        kind: "generate",
        modelId: "qwen",
        device: "GPU0",
        inputPath: null,
        startedAt: 0,
        phase: "sampling",
        step: 2,
        steps: 4,
        secondsPerStep: 1,
      },
    });
    usePlaygroundStore.getState().finishJob({
      jobId: "img-1",
      status: "done",
      path: "C:/out/a.png",
      error: null,
      seed: 7,
      seconds: 3,
    });
    expect(usePlaygroundStore.getState().result?.device).toBe("GPU0");
    expect(usePlaygroundStore.getState().job).toBeNull();
  });

  it("keeps the input picture of an image to image job with its result", () => {
    usePlaygroundStore.setState({
      job: {
        jobId: "edit-1",
        kind: "generate",
        modelId: "sd15",
        device: "auto",
        inputPath: "C:/in/cat.png",
        startedAt: 0,
        phase: "sampling",
        step: 0,
        steps: 4,
        secondsPerStep: null,
      },
    });
    usePlaygroundStore.getState().finishJob({
      jobId: "edit-1",
      status: "done",
      path: "C:/out/b.png",
      error: null,
      seed: 3,
      seconds: 9,
    });
    expect(usePlaygroundStore.getState().result?.inputPath).toBe("C:/in/cat.png");
  });
});

describe("image to image input", () => {
  const sd = model("sd15", { imageInput: "init", downloaded: true });
  const flux = model("klein", { imageInput: "reference", downloaded: true });

  beforeEach(() => {
    usePlaygroundStore.setState({ inputImage: null, strength: 0.6 });
  });

  it("sets the form's size from the input picture when the picture's size is known", () => {
    usePlaygroundStore.setState({ models: [sd], selectedModelId: "sd15" });
    usePlaygroundStore.getState().setInputImage({
      path: "C:/in/cat.png",
      name: "cat.png",
      sourceSize: null,
    });
    usePlaygroundStore.getState().setInputSourceSize({ width: 1920, height: 1080 });

    const state = usePlaygroundStore.getState();
    expect(state.inputImage?.sourceSize).toEqual({ width: 1920, height: 1080 });
    expect(state.form).toMatchObject({ width: 688, height: 384 });
  });

  it("leaves the size alone while no model is selected", () => {
    usePlaygroundStore.getState().setInputImage({
      path: "C:/in/cat.png",
      name: "cat.png",
      sourceSize: null,
    });
    const before = usePlaygroundStore.getState().form;
    usePlaygroundStore.getState().setInputSourceSize({ width: 1920, height: 1080 });
    expect(usePlaygroundStore.getState().form).toBe(before);
  });

  it("takes the model's defaults and the input's shape when an edit model is selected", () => {
    usePlaygroundStore.setState({
      models: [flux],
      inputImage: {
        path: "C:/in/cat.png",
        name: "cat.png",
        sourceSize: { width: 1080, height: 1920 },
      },
    });
    usePlaygroundStore.getState().selectEditModel(flux);

    const state = usePlaygroundStore.getState();
    expect(state.selectedModelId).toBe("klein");
    expect(state.form).toMatchObject({ width: 384, height: 688, steps: 4, cfgScale: 1 });
  });

  it("keeps the strength inside its range", () => {
    usePlaygroundStore.getState().setStrength(3);
    expect(usePlaygroundStore.getState().strength).toBe(1);
  });
});

describe("image upscaling", () => {
  const upscaleModel = (id: string, downloaded: boolean): UpscaleModel => ({
    id,
    name: id,
    description: "",
    license: "",
    licenseUrl: "",
    sizeBytes: 1,
    downloaded,
    bestFor: "",
  });

  beforeEach(() => {
    usePlaygroundStore.setState({
      upscaleModels: null,
      upscaleModelId: null,
      upscaleInput: null,
    });
  });

  it("selects the first downloaded model when the catalog arrives", () => {
    usePlaygroundStore
      .getState()
      .setUpscaleModels([upscaleModel("a", false), upscaleModel("b", true)]);
    expect(usePlaygroundStore.getState().upscaleModelId).toBe("b");
  });

  it("keeps a selection that is still listed", () => {
    usePlaygroundStore.setState({ upscaleModelId: "a" });
    usePlaygroundStore
      .getState()
      .setUpscaleModels([upscaleModel("a", false), upscaleModel("b", true)]);
    expect(usePlaygroundStore.getState().upscaleModelId).toBe("a");
  });

  it("clears the selection when the selected model is deleted", () => {
    usePlaygroundStore.setState({ upscaleModelId: "a" });
    usePlaygroundStore
      .getState()
      .replaceUpscaleModelsAfterDelete([upscaleModel("a", false), upscaleModel("b", true)], "a");
    expect(usePlaygroundStore.getState().upscaleModelId).toBeNull();
  });

  it("stores the input's size once its preview has loaded", () => {
    usePlaygroundStore.getState().setUpscaleInputSize({ width: 1, height: 1 });
    expect(usePlaygroundStore.getState().upscaleInput).toBeNull();
    usePlaygroundStore
      .getState()
      .setUpscaleInput({ path: "C:/in/a.png", name: "a.png", sourceSize: null });
    usePlaygroundStore.getState().setUpscaleInputSize({ width: 256, height: 128 });
    expect(usePlaygroundStore.getState().upscaleInput?.sourceSize).toEqual({
      width: 256,
      height: 128,
    });
  });

  it("keeps the job's kind with its result", () => {
    usePlaygroundStore.setState({
      job: {
        jobId: "up-1",
        kind: "upscale",
        modelId: "a",
        device: "auto",
        inputPath: "C:/in/a.png",
        startedAt: 0,
        phase: "loading",
        step: 0,
        steps: 0,
        secondsPerStep: null,
      },
    });
    usePlaygroundStore.getState().finishJob({
      jobId: "up-1",
      status: "done",
      path: "C:/out/a.png",
      error: null,
      seed: null,
      seconds: 12,
    });
    expect(usePlaygroundStore.getState().result?.kind).toBe("upscale");
  });
});
