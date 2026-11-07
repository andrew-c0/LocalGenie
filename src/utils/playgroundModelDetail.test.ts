import { describe, expect, it } from "vitest";
import type { ImageModel, OcrModel, SpeechModel, UpscaleModel } from "../types";
import { formatBytes } from "./format";
import type { SpecCell } from "./modelSpecs";
import type { PlaygroundCatalogs } from "./playgroundLocalModels";
import {
  type CatalogEntry,
  detailStatusOf,
  findCatalogEntry,
  groupOfEntry,
  groupOfParam,
  playgroundModelDetailOf,
  playgroundModelPathOf,
  toolTargetOf,
} from "./playgroundModelDetail";

const MB = 1_048_576;

const links = {
  cardRepo: "org/model-card",
  sourceUrl: "https://example.com/source",
  docsUrl: null,
};

const image = (overrides: Partial<ImageModel> = {}): ImageModel => ({
  id: "sdxl-turbo",
  name: "SDXL Turbo",
  description: "Fast",
  license: "MIT",
  licenseUrl: "https://example.com/licence",
  links,
  totalBytes: 2 * MB,
  downloaded: false,
  files: [{ fileName: "unet.safetensors", sizeBytes: MB, present: false, source: "org/sdxl" }],
  defaults: { width: 512, height: 512, steps: 4, cfgScale: 1 },
  supportsNegativePrompt: true,
  cfgAdjustable: false,
  imageInput: "none",
  ...overrides,
});

const upscale = (overrides: Partial<UpscaleModel> = {}): UpscaleModel => ({
  id: "real-esrgan",
  name: "Real-ESRGAN",
  description: "Balanced",
  license: "BSD",
  licenseUrl: "",
  links,
  sizeBytes: MB,
  downloaded: false,
  bestFor: "Photos",
  ...overrides,
});

const speech = (overrides: Partial<SpeechModel> = {}): SpeechModel => ({
  id: "whisper",
  kind: "stt",
  name: "Whisper",
  description: "Speech to text",
  license: "",
  licenseUrl: "",
  links,
  sizeBytes: MB,
  languages: ["en", "de"],
  downloaded: false,
  voices: [],
  needsReference: false,
  ...overrides,
});

const ocr = (overrides: Partial<OcrModel> = {}): OcrModel => ({
  id: "docs-ocr",
  name: "Docs OCR",
  description: "Reads pages",
  bestFor: "Documents and tables",
  license: "",
  licenseUrl: "",
  links,
  sizeBytes: MB,
  downloaded: false,
  modes: [
    { id: "text", label: "Text" },
    { id: "table", label: "Table" },
  ],
  ...overrides,
});

const emptyCatalogs: PlaygroundCatalogs = { image: [], upscale: [], speech: [], ocr: [] };

/** The value of the cell with this label, or undefined when the page leaves it out. */
function cellValue(cells: SpecCell[], label: string): string | null | undefined {
  return cells.find((cell) => cell.label === label)?.value;
}

describe("groupOfParam", () => {
  it("returns the group a route parameter names", () => {
    expect(groupOfParam("stt")).toBe("stt");
    expect(groupOfParam("imageToImage")).toBe("imageToImage");
  });

  it("returns null for an unknown or missing value", () => {
    expect(groupOfParam("nope")).toBeNull();
    expect(groupOfParam(undefined)).toBeNull();
  });
});

describe("groupOfEntry", () => {
  it("lists an image model that takes a picture under image to image", () => {
    expect(groupOfEntry({ kind: "image", model: image({ imageInput: "init" }) })).toBe(
      "imageToImage",
    );
    expect(groupOfEntry({ kind: "image", model: image() })).toBe("imageGeneration");
  });

  it("lists a speech model under the group of its kind", () => {
    expect(groupOfEntry({ kind: "speech", model: speech({ kind: "tts" }) })).toBe("tts");
    expect(groupOfEntry({ kind: "speech", model: speech({ kind: "denoise" }) })).toBe(
      "audioToAudio",
    );
  });
});

describe("findCatalogEntry", () => {
  it("picks the catalog by group when two catalogs share an id", () => {
    const catalogs: PlaygroundCatalogs = {
      image: [image({ id: "shared" })],
      upscale: [upscale({ id: "shared" })],
      speech: [],
      ocr: [],
    };
    expect(findCatalogEntry(catalogs, "upscale", "shared")?.kind).toBe("upscale");
    expect(findCatalogEntry(catalogs, "imageGeneration", "shared")?.kind).toBe("image");
  });

  it("returns null when the model is in another group or no catalog", () => {
    const catalogs: PlaygroundCatalogs = { ...emptyCatalogs, image: [image()] };
    expect(findCatalogEntry(catalogs, "imageToImage", "sdxl-turbo")).toBeNull();
    expect(findCatalogEntry(catalogs, "imageGeneration", "missing")).toBeNull();
    expect(findCatalogEntry(emptyCatalogs, "imageGeneration", "sdxl-turbo")).toBeNull();
  });
});

describe("playgroundModelPathOf", () => {
  it("encodes the id so a slash stays in one segment", () => {
    expect(playgroundModelPathOf("ocr", "org/model")).toBe("/models/playground/ocr/org%2Fmodel");
  });
});

describe("toolTargetOf", () => {
  it("opens each image model in its own tool", () => {
    expect(toolTargetOf({ kind: "image", model: image() }).toolId).toBe("playground-text-to-image");
    expect(toolTargetOf({ kind: "image", model: image({ imageInput: "init" }) }).toolId).toBe(
      "playground-image-to-image",
    );
  });

  it("opens the speech models in the Audio tool on their task", () => {
    expect(toolTargetOf({ kind: "speech", model: speech({ kind: "stt" }) })).toEqual({
      toolId: "playground-audio",
      audioTask: "transcribe",
      enhanceKind: null,
    });
    expect(toolTargetOf({ kind: "speech", model: speech({ kind: "tts" }) })).toEqual({
      toolId: "playground-audio",
      audioTask: "speak",
      enhanceKind: null,
    });
    expect(toolTargetOf({ kind: "speech", model: speech({ kind: "separate" }) })).toEqual({
      toolId: "playground-audio",
      audioTask: "enhance",
      enhanceKind: "separate",
    });
  });

  it("opens upscaling and OCR in their own tools", () => {
    expect(toolTargetOf({ kind: "upscale", model: upscale() }).toolId).toBe(
      "playground-image-upscaling",
    );
    expect(toolTargetOf({ kind: "ocr", model: ocr() }).toolId).toBe("playground-ocr");
  });
});

describe("detailStatusOf", () => {
  const loaded: PlaygroundCatalogs = { image: [], upscale: [], speech: [], ocr: [] };
  const entry: CatalogEntry = { kind: "image", model: image() };

  it("is ready when the model is found", () => {
    expect(detailStatusOf(entry, loaded, 0)).toBe("ready");
    expect(detailStatusOf(entry, { ...loaded, ocr: null }, 1)).toBe("ready");
  });

  it("is an error before not found when a catalog failed to load", () => {
    expect(detailStatusOf(null, loaded, 1)).toBe("error");
    expect(detailStatusOf(null, { ...loaded, image: null }, 1)).toBe("error");
  });

  it("is loading while a catalog has not been read", () => {
    expect(detailStatusOf(null, { ...loaded, speech: null }, 0)).toBe("loading");
  });

  it("is not found when every catalog is read and none lists the model", () => {
    expect(detailStatusOf(null, loaded, 0)).toBe("notFound");
  });
});

const notInstalled = { installed: false, downloading: false };

/** The capability icons of a model's entry, as their ids. */
const badgeIds = (entry: CatalogEntry): string[] =>
  playgroundModelDetailOf(entry, notInstalled).capabilities.map((badge) => badge.id);

describe("playgroundModelDetailOf", () => {
  it("shows an image model's tool, size, licence and resolution in the facts", () => {
    const detail = playgroundModelDetailOf({ kind: "image", model: image() }, notInstalled);
    expect(cellValue(detail.facts, "Tool")).toBe("Image generation");
    expect(cellValue(detail.facts, "Size")).toBe(formatBytes(2 * MB));
    expect(cellValue(detail.facts, "Licence")).toBe("MIT");
    expect(cellValue(detail.facts, "Resolution")).toBe("512 x 512");
  });

  it("links the licence in the facts when the model has a licence page", () => {
    const detail = playgroundModelDetailOf({ kind: "image", model: image() }, notInstalled);
    expect(detail.facts.find((cell) => cell.label === "Licence")?.href).toBe(
      "https://example.com/licence",
    );
  });

  it("shows the install status in the facts", () => {
    const entry: CatalogEntry = { kind: "image", model: image() };
    const status = (state: { installed: boolean; downloading: boolean }) =>
      cellValue(playgroundModelDetailOf(entry, state).facts, "Status");
    expect(status(notInstalled)).toBe("Not installed");
    expect(status({ installed: false, downloading: true })).toBe("Downloading");
    expect(status({ installed: true, downloading: false })).toBe("Installed");
  });

  it("shows the model's description", () => {
    const detail = playgroundModelDetailOf({ kind: "image", model: image() }, notInstalled);
    expect(detail.description).toBe("Fast");
  });

  it("shows an image model's steps, fixed CFG scale and input kind in the specifications", () => {
    const detail = playgroundModelDetailOf({ kind: "image", model: image() }, notInstalled);
    expect(cellValue(detail.specs, "Steps")).toBe("4");
    expect(cellValue(detail.specs, "CFG scale")).toBe("1 (fixed)");
    expect(cellValue(detail.specs, "Negative prompt")).toBe("Supported");
    expect(cellValue(detail.specs, "Input picture")).toBe("Text to image only");
  });

  it("names the input kind of an image to image model", () => {
    const detail = playgroundModelDetailOf(
      { kind: "image", model: image({ imageInput: "reference", cfgAdjustable: true }) },
      notInstalled,
    );
    expect(cellValue(detail.specs, "Input picture")).toBe("Edit with instructions");
    expect(cellValue(detail.specs, "CFG scale")).toBe("1");
  });

  it("gives a text to image model the text to image and negative prompt capabilities", () => {
    expect(badgeIds({ kind: "image", model: image() })).toEqual(["textToImage", "negativePrompt"]);
  });

  it("gives an edit model the image edit capability, and no text to image", () => {
    const entry: CatalogEntry = {
      kind: "image",
      model: image({ imageInput: "reference", supportsNegativePrompt: false }),
    };
    expect(badgeIds(entry)).toEqual(["imageEdit"]);
  });

  it("gives a re-draw model the re-draw capability", () => {
    const entry: CatalogEntry = { kind: "image", model: image({ imageInput: "init" }) };
    expect(badgeIds(entry)).toEqual(["redraw", "negativePrompt"]);
  });

  it("gives an upscaler the upscale capability and its scale in the facts", () => {
    const entry: CatalogEntry = { kind: "upscale", model: upscale() };
    expect(badgeIds(entry)).toEqual(["upscale"]);
    expect(cellValue(playgroundModelDetailOf(entry, notInstalled).facts, "Scale")).toBe("4x");
  });

  it.each([
    ["stt", "speechToText"],
    ["tts", "textToSpeech"],
    ["denoise", "denoise"],
    ["separate", "stemSplit"],
  ] as const)("gives a speech model of kind %s the %s capability", (kind, id) => {
    expect(badgeIds({ kind: "speech", model: speech({ kind }) })).toEqual([id]);
  });

  it("adds voice cloning to a text to speech model that copies a voice", () => {
    const entry: CatalogEntry = {
      kind: "speech",
      model: speech({ kind: "tts", needsReference: true }),
    };
    expect(badgeIds(entry)).toEqual(["textToSpeech", "voiceCloning"]);
  });

  it("gives an OCR model reading text and tables from its modes", () => {
    expect(badgeIds({ kind: "ocr", model: ocr() })).toEqual(["ocrText", "ocrTables"]);
    expect(
      badgeIds({ kind: "ocr", model: ocr({ modes: [{ id: "text", label: "Text" }] }) }),
    ).toEqual(["ocrText"]);
  });

  it("lists an image model's files with a link to each Hugging Face repo", () => {
    const detail = playgroundModelDetailOf({ kind: "image", model: image() }, notInstalled);
    expect(detail.files).toEqual([
      {
        name: "unet.safetensors",
        sizeLabel: formatBytes(MB),
        sourceLabel: "org/sdxl",
        sourceUrl: "https://huggingface.co/org/sdxl",
      },
    ]);
  });

  it("lists an archive model as its one file, linked to its source page", () => {
    const detail = playgroundModelDetailOf({ kind: "upscale", model: upscale() }, notInstalled);
    expect(detail.files).toEqual([
      {
        name: "Real-ESRGAN",
        sizeLabel: formatBytes(MB),
        sourceLabel: "https://example.com/source",
        sourceUrl: "https://example.com/source",
      },
    ]);
  });

  it("shows an upscaler's largest input and its best-for line in the specifications", () => {
    const detail = playgroundModelDetailOf({ kind: "upscale", model: upscale() }, notInstalled);
    expect(cellValue(detail.specs, "Largest input side")).toBe("1024 px");
    expect(cellValue(detail.specs, "Best for")).toBe("Photos");
  });

  it("shows a speech to text model's languages in the facts and its kind in the specifications", () => {
    const detail = playgroundModelDetailOf({ kind: "speech", model: speech() }, notInstalled);
    expect(cellValue(detail.facts, "Languages")).toBe("en, de");
    expect(cellValue(detail.specs, "Kind")).toBe("Speech to text");
    expect(cellValue(detail.specs, "Voices")).toBeUndefined();
  });

  it("names a text to speech model's voices in the specifications", () => {
    const detail = playgroundModelDetailOf(
      {
        kind: "speech",
        model: speech({
          kind: "tts",
          voices: [
            { id: 0, name: "heart", label: "Heart (US female)" },
            { id: 1, name: "adam", label: "Adam (US male)" },
          ],
        }),
      },
      notInstalled,
    );
    expect(cellValue(detail.specs, "Voices")).toBe("Heart (US female), Adam (US male)");
  });

  it("says a voice is copied from a reference clip when the model needs one", () => {
    const detail = playgroundModelDetailOf(
      { kind: "speech", model: speech({ kind: "tts", needsReference: true }) },
      notInstalled,
    );
    expect(cellValue(detail.specs, "Voices")).toBe("Copies the voice from a reference clip");
  });

  it("lists an OCR model's modes in the facts and its best-for line in the specifications", () => {
    const detail = playgroundModelDetailOf({ kind: "ocr", model: ocr() }, notInstalled);
    expect(cellValue(detail.facts, "Read as")).toBe("Text, Table");
    expect(cellValue(detail.specs, "Best for")).toBe("Documents and tables");
  });

  it("leaves out the documentation link when the model has none", () => {
    const detail = playgroundModelDetailOf({ kind: "ocr", model: ocr() }, notInstalled);
    expect(detail.specs.map((cell) => cell.label)).toEqual(["Best for", "Source"]);
  });

  it("shows the documentation link when the model has one", () => {
    const detail = playgroundModelDetailOf(
      { kind: "ocr", model: ocr({ links: { ...links, docsUrl: "https://example.com/docs" } }) },
      notInstalled,
    );
    expect(detail.specs).toContainEqual({
      label: "Documentation",
      value: "https://example.com/docs",
      href: "https://example.com/docs",
    });
  });

  it("passes the model card repo and the source page through", () => {
    const detail = playgroundModelDetailOf({ kind: "image", model: image() }, notInstalled);
    expect(detail.cardRepo).toBe("org/model-card");
    expect(detail.sourceUrl).toBe("https://example.com/source");
  });

  it("gives no card repo when none is published", () => {
    const detail = playgroundModelDetailOf(
      { kind: "image", model: image({ links: { ...links, cardRepo: null } }) },
      notInstalled,
    );
    expect(detail.cardRepo).toBeNull();
  });
});
