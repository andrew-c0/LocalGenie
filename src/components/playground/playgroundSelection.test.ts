import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOcrStore } from "../../stores/ocrStore";
import { usePlaygroundStore } from "../../stores/playgroundStore";
import { useSpeechStore } from "../../stores/speechStore";
import type { ImageModel, SpeechModel, UpscaleModel } from "../../types";
import { DEFAULT_IMAGE_FORM } from "../../utils/playground";
import { NO_SPEECH_SELECTION } from "../../utils/speech";
import { startOcrServer } from "./OcrPanel/startOcrServer";
import { clearToolModel, toggleToolModel } from "./playgroundSelection";

vi.mock("./OcrPanel/startOcrServer", () => ({ startOcrServer: vi.fn() }));

const imageModel = (id: string): ImageModel => ({
  id,
  name: id,
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  totalBytes: 0,
  downloaded: true,
  files: [],
  defaults: { width: 512, height: 512, steps: 4, cfgScale: 1 },
  supportsNegativePrompt: true,
  cfgAdjustable: true,
  imageInput: "none",
});

const upscaleModel = (id: string): UpscaleModel => ({
  id,
  name: id,
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: 1,
  downloaded: true,
  bestFor: "",
});

const speechModel = (id: string, kind: SpeechModel["kind"]): SpeechModel => ({
  id,
  kind,
  name: id,
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: 1,
  languages: [],
  downloaded: true,
  voices: [],
  needsReference: false,
});

beforeEach(() => {
  vi.mocked(startOcrServer).mockClear();
  usePlaygroundStore.setState({
    models: [imageModel("sdxl")],
    selectedModelId: null,
    form: DEFAULT_IMAGE_FORM,
    upscaleModels: [upscaleModel("esrgan")],
    upscaleModelId: null,
  });
  useOcrStore.setState({ selectedModelId: null });
  useSpeechStore.setState({
    models: [speechModel("whisper", "stt"), speechModel("gtcrn", "denoise")],
    selectedModelIds: NO_SPEECH_SELECTION,
    audioTask: "transcribe",
    enhanceKind: "denoise",
  });
});

describe("toggleToolModel", () => {
  it("picks an installed model the tool does not use yet", () => {
    toggleToolModel("playground-text-to-image", "sdxl", false);
    expect(usePlaygroundStore.getState().selectedModelId).toBe("sdxl");
  });

  it("clears the model the tool already uses", () => {
    usePlaygroundStore.setState({ selectedModelId: "sdxl" });
    toggleToolModel("playground-text-to-image", "sdxl", true);
    expect(usePlaygroundStore.getState().selectedModelId).toBeNull();
  });

  it("starts the OCR server when an OCR model is picked", () => {
    useOcrStore.setState({ selectedModelId: null });
    toggleToolModel("playground-ocr", "qwen-vl", false);
    expect(useOcrStore.getState().selectedModelId).toBe("qwen-vl");
    expect(startOcrServer).toHaveBeenCalledTimes(1);
  });

  it("does not start the OCR server when the OCR model is cleared", () => {
    useOcrStore.setState({ selectedModelId: "qwen-vl" });
    toggleToolModel("playground-ocr", "qwen-vl", true);
    expect(useOcrStore.getState().selectedModelId).toBeNull();
    expect(startOcrServer).not.toHaveBeenCalled();
  });

  it("does not start the OCR server for other tools", () => {
    toggleToolModel("playground-image-upscaling", "esrgan", false);
    expect(startOcrServer).not.toHaveBeenCalled();
  });
});

describe("clearToolModel", () => {
  it("clears the upscaling selection", () => {
    usePlaygroundStore.setState({ upscaleModelId: "esrgan" });
    clearToolModel("playground-image-upscaling");
    expect(usePlaygroundStore.getState().upscaleModelId).toBeNull();
  });

  it("clears only the model of the audio task the tool is set to", () => {
    useSpeechStore.setState({
      selectedModelIds: { ...NO_SPEECH_SELECTION, stt: "whisper", denoise: "gtcrn" },
      audioTask: "transcribe",
      enhanceKind: "denoise",
    });
    clearToolModel("playground-audio");
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      ...NO_SPEECH_SELECTION,
      denoise: "gtcrn",
    });
  });

  it("clears the clean up or split model when the task is enhance", () => {
    useSpeechStore.setState({
      selectedModelIds: { ...NO_SPEECH_SELECTION, denoise: "gtcrn", stt: "whisper" },
      audioTask: "enhance",
      enhanceKind: "denoise",
    });
    clearToolModel("playground-audio");
    expect(useSpeechStore.getState().selectedModelIds).toEqual({
      ...NO_SPEECH_SELECTION,
      stt: "whisper",
    });
  });
});
