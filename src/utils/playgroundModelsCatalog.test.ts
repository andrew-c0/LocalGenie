import { describe, expect, it } from "vitest";
import type { ImageModel, OcrModel, SpeechModel, UpscaleModel } from "../types";
import { formatBytes } from "./format";
import { SD_CPP_RUNTIME_ID } from "./playground";
import type { PlaygroundCatalogs } from "./playgroundLocalModels";
import {
  buildCatalogRows,
  type CatalogModelRow,
  catalogSectionsOf,
  curatedCountOf,
  filterCatalogRows,
  playgroundModelsFactOf,
  runtimeNeedOf,
  toolFilterOf,
} from "./playgroundModelsCatalog";
import { SHERPA_RUNTIME_ID } from "./speech";

const MB = 1_048_576;

const image = (overrides: Partial<ImageModel> = {}): ImageModel => ({
  id: "sdxl-turbo",
  name: "SDXL Turbo",
  description: "Fast",
  license: "MIT",
  licenseUrl: "https://example.com/licence",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  totalBytes: 2 * MB,
  downloaded: false,
  files: [],
  defaults: { width: 512, height: 512, steps: 4, cfgScale: 1 },
  supportsNegativePrompt: true,
  cfgAdjustable: true,
  imageInput: "none",
  ...overrides,
});

const upscale = (overrides: Partial<UpscaleModel> = {}): UpscaleModel => ({
  id: "real-esrgan",
  name: "Real-ESRGAN",
  description: "Balanced",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: MB,
  downloaded: false,
  bestFor: "Photos",
  ...overrides,
});

const speech = (overrides: Partial<SpeechModel> = {}): SpeechModel => ({
  id: "whisper",
  kind: "stt",
  name: "Whisper",
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: MB,
  languages: ["en", "de"],
  downloaded: false,
  voices: [],
  needsReference: false,
  ...overrides,
});

const ocr = (overrides: Partial<OcrModel> = {}): OcrModel => ({
  id: "qwen-vl",
  name: "Qwen VL",
  description: "",
  bestFor: "Documents",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: MB,
  downloaded: false,
  modes: [{ id: "text", label: "Text" }],
  ...overrides,
});

const catalogs = (overrides: Partial<PlaygroundCatalogs> = {}): PlaygroundCatalogs => ({
  image: [],
  upscale: [],
  speech: [],
  ocr: [],
  ...overrides,
});

describe("buildCatalogRows", () => {
  const rows = buildCatalogRows(
    catalogs({
      image: [
        image({ id: "t2i", downloaded: true }),
        image({
          id: "i2i",
          name: "Edit model",
          imageInput: "reference",
          totalBytes: 3 * MB,
        }),
      ],
      upscale: [upscale({ id: "up" })],
      speech: [
        speech({ id: "stt", kind: "stt", downloaded: true }),
        speech({ id: "tts", kind: "tts", name: "Kokoro", voices: [] }),
        speech({ id: "enh", kind: "denoise", name: "Denoiser" }),
      ],
      ocr: [ocr({ id: "reader", downloaded: true })],
    }),
  );

  it("lists every curated model in catalog order", () => {
    expect(rows.map((row) => row.id)).toEqual(["t2i", "i2i", "up", "stt", "tts", "enh", "reader"]);
  });

  it("puts an image model that takes a picture under image to image", () => {
    expect(rows.find((row) => row.id === "t2i")?.group).toBe("imageGeneration");
    expect(rows.find((row) => row.id === "i2i")?.group).toBe("imageToImage");
  });

  it("groups speech models by their task", () => {
    expect(rows.find((row) => row.id === "stt")?.group).toBe("stt");
    expect(rows.find((row) => row.id === "tts")?.group).toBe("tts");
    expect(rows.find((row) => row.id === "enh")?.group).toBe("audioToAudio");
  });

  it("carries the installed state, size, licence, languages and best-for text", () => {
    const t2i = rows.find((row) => row.id === "t2i");
    expect(t2i).toMatchObject({
      installed: true,
      catalog: "image",
      sizeLabel: formatBytes(2 * MB),
      license: "MIT",
      licenseUrl: "https://example.com/licence",
      languagesLabel: "",
      bestFor: "",
    });
    expect(rows.find((row) => row.id === "stt")?.languagesLabel).toBe("en, de");
    expect(rows.find((row) => row.id === "up")?.bestFor).toBe("Photos");
    expect(rows.find((row) => row.id === "reader")?.bestFor).toBe("Documents");
  });

  it("gives no rows for a catalog that has not loaded", () => {
    expect(buildCatalogRows(catalogs({ image: null, ocr: null }))).toEqual([]);
  });
});

describe("filterCatalogRows", () => {
  const row = (overrides: Partial<CatalogModelRow>): CatalogModelRow => ({
    id: "id",
    name: "Name",
    group: "imageGeneration",
    catalog: "image",
    description: "",
    installed: false,
    sizeLabel: "",
    license: "",
    licenseUrl: "",
    languagesLabel: "",
    bestFor: "",
    ...overrides,
  });
  const rows = [
    row({ id: "a", name: "FLUX schnell", installed: true }),
    row({ id: "b", name: "SDXL Turbo" }),
    row({ id: "c", name: "Real-ESRGAN", group: "upscale", catalog: "upscale", installed: true }),
  ];
  const all = { tool: "all", installed: "all", query: "" } as const;

  it("keeps every row for the all filters and a blank query", () => {
    expect(filterCatalogRows(rows, all).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by tool", () => {
    expect(filterCatalogRows(rows, { ...all, tool: "upscale" }).map((r) => r.id)).toEqual(["c"]);
  });

  it("filters by installed state", () => {
    expect(filterCatalogRows(rows, { ...all, installed: "installed" }).map((r) => r.id)).toEqual([
      "a",
      "c",
    ]);
    expect(filterCatalogRows(rows, { ...all, installed: "notInstalled" }).map((r) => r.id)).toEqual(
      ["b"],
    );
  });

  it("matches the name case-insensitively, ignoring surrounding spaces", () => {
    expect(filterCatalogRows(rows, { ...all, query: "  turbo " }).map((r) => r.id)).toEqual(["b"]);
  });

  it("combines the filters", () => {
    expect(
      filterCatalogRows(rows, { tool: "imageGeneration", installed: "installed", query: "flux" }),
    ).toHaveLength(1);
    expect(
      filterCatalogRows(rows, { tool: "imageGeneration", installed: "installed", query: "esrgan" }),
    ).toEqual([]);
  });
});

describe("catalogSectionsOf", () => {
  const row = (id: string, group: CatalogModelRow["group"], installed: boolean) =>
    ({
      id,
      name: id,
      group,
      catalog: "image",
      description: "",
      installed,
      sizeLabel: "",
      license: "",
      licenseUrl: "",
      languagesLabel: "",
      bestFor: "",
    }) satisfies CatalogModelRow;

  it("orders the sections by tool and leaves out empty tools", () => {
    const sections = catalogSectionsOf([
      row("ocr", "ocr", false),
      row("t2i", "imageGeneration", false),
    ]);
    expect(sections.map((section) => section.label)).toEqual(["Image generation", "OCR"]);
  });

  it("lists the installed models of a tool before the others", () => {
    const sections = catalogSectionsOf([
      row("missing", "imageGeneration", false),
      row("have", "imageGeneration", true),
      row("also-missing", "imageGeneration", false),
    ]);
    expect(sections[0]?.rows.map((r) => r.id)).toEqual(["have", "missing", "also-missing"]);
  });

  it("gives no sections for no rows", () => {
    expect(catalogSectionsOf([])).toEqual([]);
  });
});

describe("toolFilterOf", () => {
  it("reads a tool group from the query value", () => {
    expect(toolFilterOf("upscale")).toBe("upscale");
    expect(toolFilterOf("audioToAudio")).toBe("audioToAudio");
  });

  it("falls back to all for a missing or unknown value", () => {
    expect(toolFilterOf(null)).toBe("all");
    expect(toolFilterOf("playground-ocr")).toBe("all");
  });
});

describe("curatedCountOf and playgroundModelsFactOf", () => {
  it("adds the four catalogs together", () => {
    expect(
      curatedCountOf(
        catalogs({
          image: [image(), image({ id: "b" })],
          upscale: [upscale()],
          speech: [speech()],
          ocr: [ocr()],
        }),
      ),
    ).toBe(5);
  });

  it("is null while any catalog has not loaded", () => {
    expect(curatedCountOf(catalogs({ speech: null }))).toBeNull();
  });

  it("reads N installed of M, counting OCR among the installed", () => {
    const fact = playgroundModelsFactOf(
      catalogs({
        image: [image({ downloaded: true }), image({ id: "b" })],
        upscale: [upscale({ downloaded: true })],
        speech: [speech()],
        ocr: [ocr({ downloaded: true })],
      }),
    );
    expect(fact).toBe("3 installed of 5");
  });

  it("shows only the installed count until every catalog has loaded", () => {
    expect(
      playgroundModelsFactOf(catalogs({ ocr: null, image: [image({ downloaded: true })] })),
    ).toBe("1 installed");
  });
});

describe("runtimeNeedOf", () => {
  it("gives the image and upscaling tools stable-diffusion.cpp", () => {
    expect(runtimeNeedOf("imageGeneration")).toBe(SD_CPP_RUNTIME_ID);
    expect(runtimeNeedOf("imageToImage")).toBe(SD_CPP_RUNTIME_ID);
    expect(runtimeNeedOf("upscale")).toBe(SD_CPP_RUNTIME_ID);
  });

  it("gives the speech tools sherpa-onnx, and OCR the GenieX CLI", () => {
    expect(runtimeNeedOf("stt")).toBe(SHERPA_RUNTIME_ID);
    expect(runtimeNeedOf("tts")).toBe(SHERPA_RUNTIME_ID);
    expect(runtimeNeedOf("audioToAudio")).toBe(SHERPA_RUNTIME_ID);
    expect(runtimeNeedOf("ocr")).toBe("cli");
  });
});
