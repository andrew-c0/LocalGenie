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
});
