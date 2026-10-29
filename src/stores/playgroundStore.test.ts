import { beforeEach, describe, expect, it } from "vitest";
import type { ImageModel, PlaygroundDevice } from "../types";
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
