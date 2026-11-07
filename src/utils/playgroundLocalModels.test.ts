import { describe, expect, it } from "vitest";
import type { ImageModel, OcrModel, SpeechModel, UpscaleModel } from "../types";
import { formatBytes } from "./format";
import {
  collectInstalledPlaygroundModels,
  deleteBodyOf,
  type PlaygroundCatalogs,
  speechGroupOf,
} from "./playgroundLocalModels";

const image = (overrides: Partial<ImageModel>): ImageModel => ({
  id: "img",
  name: "Image model",
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  totalBytes: 1_000,
  downloaded: true,
  files: [],
  defaults: { width: 512, height: 512, steps: 4, cfgScale: 1 },
  supportsNegativePrompt: false,
  cfgAdjustable: false,
  imageInput: "none",
  ...overrides,
});

const upscale = (overrides: Partial<UpscaleModel>): UpscaleModel => ({
  id: "up",
  name: "Upscaler",
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: 2_000,
  downloaded: true,
  bestFor: "",
  ...overrides,
});

const speech = (overrides: Partial<SpeechModel>): SpeechModel => ({
  id: "speech",
  kind: "stt",
  name: "Speech model",
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: 3_000,
  languages: [],
  downloaded: true,
  voices: [],
  needsReference: false,
  ...overrides,
});

const ocr = (overrides: Partial<OcrModel>): OcrModel => ({
  id: "ocr",
  name: "OCR model",
  description: "",
  bestFor: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: 4_000,
  downloaded: true,
  modes: [],
  ...overrides,
});

const EMPTY: PlaygroundCatalogs = { image: null, upscale: null, speech: null, ocr: null };

describe("speechGroupOf", () => {
  it("maps each speech kind to its tool", () => {
    expect(speechGroupOf("stt")).toBe("stt");
    expect(speechGroupOf("tts")).toBe("tts");
    expect(speechGroupOf("denoise")).toBe("audioToAudio");
    expect(speechGroupOf("separate")).toBe("audioToAudio");
  });
});

describe("collectInstalledPlaygroundModels", () => {
  it("returns nothing while the catalogs are unread", () => {
    expect(collectInstalledPlaygroundModels(EMPTY)).toEqual([]);
  });

  it("leaves out models that are not downloaded", () => {
    const list = collectInstalledPlaygroundModels({
      ...EMPTY,
      upscale: [upscale({ id: "a", downloaded: false }), upscale({ id: "b" })],
    });
    expect(list.map((m) => m.id)).toEqual(["b"]);
  });

  it("lists text to image models under image generation and input picture models under image to image", () => {
    const list = collectInstalledPlaygroundModels({
      ...EMPTY,
      image: [
        image({ id: "t2i", name: "Text model", imageInput: "none", totalBytes: 10 }),
        image({ id: "i2i", name: "Edit model", imageInput: "reference", totalBytes: 20 }),
        image({ id: "init", name: "Redraw model", imageInput: "init", totalBytes: 30 }),
      ],
    });
    expect(list).toEqual([
      { id: "t2i", kind: "imageGeneration", label: "Text model", sizeBytes: 10 },
      { id: "i2i", kind: "imageToImage", label: "Edit model", sizeBytes: 20 },
      { id: "init", kind: "imageToImage", label: "Redraw model", sizeBytes: 30 },
    ]);
  });

  it("maps upscaling, OCR and each speech kind to their groups with their sizes", () => {
    const list = collectInstalledPlaygroundModels({
      image: null,
      upscale: [upscale({ id: "up", name: "Up", sizeBytes: 5 })],
      speech: [
        speech({ id: "s1", kind: "stt", name: "Whisper", sizeBytes: 6 }),
        speech({ id: "s2", kind: "tts", name: "Kokoro", sizeBytes: 7 }),
        speech({ id: "s3", kind: "denoise", name: "Denoiser", sizeBytes: 8 }),
        speech({ id: "s4", kind: "separate", name: "Splitter", sizeBytes: 9 }),
      ],
      ocr: [ocr({ id: "o", name: "Reader", sizeBytes: 10 })],
    });
    expect(list).toEqual([
      { id: "up", kind: "upscale", label: "Up", sizeBytes: 5 },
      { id: "s1", kind: "stt", label: "Whisper", sizeBytes: 6 },
      { id: "s2", kind: "tts", label: "Kokoro", sizeBytes: 7 },
      { id: "s3", kind: "audioToAudio", label: "Denoiser", sizeBytes: 8 },
      { id: "s4", kind: "audioToAudio", label: "Splitter", sizeBytes: 9 },
      { id: "o", kind: "ocr", label: "Reader", sizeBytes: 10 },
    ]);
  });
});

describe("deleteBodyOf", () => {
  it("says the size when the catalog lists one", () => {
    const body = deleteBodyOf({ id: "a", kind: "upscale", label: "A", sizeBytes: 2_000_000 });
    expect(body).toContain(formatBytes(2_000_000));
  });

  it("leaves the size out when the catalog lists none", () => {
    const body = deleteBodyOf({ id: "a", kind: "upscale", label: "A" });
    expect(body).toBe(
      "You can download it again later. Files shared with other downloaded models are kept.",
    );
  });
});
