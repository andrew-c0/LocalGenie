import { describe, expect, it } from "vitest";
import { childrenOf } from "../navigation/routeUtils";
import type { ImageModel, OcrModel, SpeechKind, SpeechModel, UpscaleModel } from "../types";
import {
  buildToolModels,
  PLAYGROUND_TOOL_IDS,
  type PlaygroundSelectorInput,
  type PlaygroundToolId,
  selectorLabelOf,
  selectorSections,
  type ToolModels,
  toolIdOf,
} from "./playgroundSelector";
import { NO_SPEECH_SELECTION } from "./speech";

const MB = 1_048_576;

const image = (overrides: Partial<ImageModel> = {}): ImageModel => ({
  id: "sdxl-turbo",
  name: "SDXL Turbo",
  description: "",
  license: "",
  licenseUrl: "",
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
  description: "",
  license: "",
  licenseUrl: "",
  sizeBytes: MB,
  downloaded: false,
  bestFor: "Photos",
  ...overrides,
});

const ocr = (overrides: Partial<OcrModel> = {}): OcrModel => ({
  id: "qwen-vl",
  name: "Qwen VL",
  description: "",
  bestFor: "Documents",
  license: "",
  licenseUrl: "",
  sizeBytes: MB,
  downloaded: false,
  modes: [{ id: "text", label: "Text" }],
  ...overrides,
});

const speech = (overrides: Partial<SpeechModel> = {}): SpeechModel => ({
  id: "whisper",
  kind: "stt",
  name: "Whisper",
  description: "",
  license: "",
  licenseUrl: "",
  sizeBytes: MB,
  languages: [],
  downloaded: false,
  voices: [],
  needsReference: false,
  ...overrides,
});

const TITLES: Record<PlaygroundToolId, string> = {
  "playground-text-to-image": "Text to image",
  "playground-image-to-image": "Image to image",
  "playground-image-upscaling": "Image upscaling",
  "playground-ocr": "OCR",
  "playground-audio": "Audio",
};

const titleOf = (toolId: PlaygroundToolId) => TITLES[toolId];

function input(overrides: Partial<PlaygroundSelectorInput> = {}): PlaygroundSelectorInput {
  return {
    image: [],
    imageSelectedId: null,
    upscale: [],
    upscaleSelectedId: null,
    ocr: [],
    ocrSelectedId: null,
    speech: [],
    speechSelectedIds: NO_SPEECH_SELECTION,
    audioTask: "transcribe",
    enhanceKind: "denoise",
    ...overrides,
  };
}

function toolOf(tools: ToolModels[], toolId: PlaygroundToolId): ToolModels {
  const tool = tools.find((candidate) => candidate.toolId === toolId);
  if (!tool) throw new Error(`no tool ${toolId}`);
  return tool;
}

describe("toolIdOf", () => {
  it("gives the id for a Playground route and null for anything else", () => {
    expect(toolIdOf("playground-ocr")).toBe("playground-ocr");
    expect(toolIdOf("chat")).toBeNull();
  });

  it("lists the same five tools as the route table, in the same order", () => {
    expect([...PLAYGROUND_TOOL_IDS]).toEqual(childrenOf("playground").map((route) => route.id));
  });
});

describe("buildToolModels", () => {
  it("returns every tool in order, with its title", () => {
    const tools = buildToolModels(input(), titleOf);
    expect(tools.map((tool) => tool.toolId)).toEqual([...PLAYGROUND_TOOL_IDS]);
    expect(tools[0]?.title).toBe("Text to image");
  });

  it("lists every image model for text to image, and only the picture-taking ones for image to image", () => {
    const models = [
      image({ id: "text", imageInput: "none" }),
      image({ id: "redraw", imageInput: "init", totalBytes: 3 * MB }),
    ];
    const tools = buildToolModels(input({ image: models }), titleOf);
    expect(toolOf(tools, "playground-text-to-image").models?.map((m) => m.id)).toEqual([
      "text",
      "redraw",
    ]);
    const edit = toolOf(tools, "playground-image-to-image").models;
    expect(edit?.map((m) => m.id)).toEqual(["redraw"]);
    expect(edit?.[0]?.detail).toBe("3.0 MB · Re-draw");
  });

  it("leaves a tool's models null while its catalog has not loaded", () => {
    const tools = buildToolModels(input({ image: null, speech: null }), titleOf);
    expect(toolOf(tools, "playground-text-to-image").models).toBeNull();
    expect(toolOf(tools, "playground-audio").models).toBeNull();
  });

  it("names the selected model when the tool lists it", () => {
    const tools = buildToolModels(
      input({
        image: [image({ id: "a", name: "Model A", downloaded: true })],
        imageSelectedId: "a",
      }),
      titleOf,
    );
    expect(toolOf(tools, "playground-text-to-image").selected?.name).toBe("Model A");
  });

  it("has no selection when the selected id is not in the list", () => {
    const tools = buildToolModels(
      input({ image: [image({ id: "a" })], imageSelectedId: "gone" }),
      titleOf,
    );
    expect(toolOf(tools, "playground-text-to-image").selected).toBeNull();
  });

  it("shares the image selection between text to image and image to image", () => {
    const edit = image({ id: "edit", imageInput: "init" });
    const tools = buildToolModels(input({ image: [edit], imageSelectedId: "edit" }), titleOf);
    expect(toolOf(tools, "playground-text-to-image").selected?.id).toBe("edit");
    expect(toolOf(tools, "playground-image-to-image").selected?.id).toBe("edit");
  });

  it("lists upscaling and OCR models with their best-for line", () => {
    const tools = buildToolModels(
      input({
        upscale: [upscale({ id: "u", bestFor: "Anime" })],
        ocr: [ocr({ id: "o", bestFor: "Tables", downloaded: true })],
        ocrSelectedId: "o",
      }),
      titleOf,
    );
    expect(toolOf(tools, "playground-image-upscaling").models?.[0]?.detail).toBe(
      "1.0 MB · Best for: Anime",
    );
    expect(toolOf(tools, "playground-ocr").selected?.name).toBe("Qwen VL");
  });

  it("lists the speech kind of the Audio tool's task, titled with the task", () => {
    const models = [
      speech({ id: "stt-1", kind: "stt" }),
      speech({ id: "tts-1", kind: "tts", voices: [] }),
      speech({ id: "den-1", kind: "denoise" }),
    ];
    const transcribe = buildToolModels(
      input({ speech: models, speechSelectedIds: { ...NO_SPEECH_SELECTION, stt: "stt-1" } }),
      titleOf,
    );
    const audio = toolOf(transcribe, "playground-audio");
    expect(audio.models?.map((m) => m.id)).toEqual(["stt-1"]);
    expect(audio.selected?.id).toBe("stt-1");
    expect(audio.title).toBe("Audio: Speech to text");

    const speak = buildToolModels(
      input({
        speech: models,
        audioTask: "speak",
        speechSelectedIds: { ...NO_SPEECH_SELECTION, tts: "tts-1" },
      }),
      titleOf,
    );
    expect(toolOf(speak, "playground-audio").models?.map((m) => m.id)).toEqual(["tts-1"]);
    expect(toolOf(speak, "playground-audio").selected?.id).toBe("tts-1");
    expect(toolOf(speak, "playground-audio").title).toBe("Audio: Text to speech");
  });

  it("follows the clean up or split kind while the Audio tool's task is enhance", () => {
    const speechModels = [
      speech({ id: "den-1", kind: "denoise", downloaded: true }),
      speech({ id: "sep-1", kind: "separate" }),
    ];
    const selectedIds: Record<SpeechKind, string | null> = {
      ...NO_SPEECH_SELECTION,
      denoise: "den-1",
      separate: "sep-1",
    };
    const denoise = buildToolModels(
      input({
        speech: speechModels,
        speechSelectedIds: selectedIds,
        audioTask: "enhance",
        enhanceKind: "denoise",
      }),
      titleOf,
    );
    expect(toolOf(denoise, "playground-audio").models?.map((m) => m.id)).toEqual(["den-1"]);
    expect(toolOf(denoise, "playground-audio").selected?.id).toBe("den-1");
    expect(toolOf(denoise, "playground-audio").title).toBe("Audio: Clean up and split");

    const separate = buildToolModels(
      input({
        speech: speechModels,
        speechSelectedIds: selectedIds,
        audioTask: "enhance",
        enhanceKind: "separate",
      }),
      titleOf,
    );
    expect(toolOf(separate, "playground-audio").models?.map((m) => m.id)).toEqual(["sep-1"]);
    expect(toolOf(separate, "playground-audio").selected?.id).toBe("sep-1");
  });
});

describe("selectorSections", () => {
  const tools = (): ToolModels[] =>
    buildToolModels(
      input({
        image: [
          image({ id: "installed-image", downloaded: true }),
          image({ id: "missing-image", downloaded: false }),
        ],
        imageSelectedId: "installed-image",
        upscale: [upscale({ id: "missing-upscale", downloaded: false })],
        speech: [speech({ id: "installed-stt", downloaded: true })],
      }),
      titleOf,
    );

  it("lists Installed before Recommended", () => {
    expect(selectorSections(tools()).map((section) => section.id)).toEqual([
      "installed",
      "recommended",
    ]);
  });

  it("leaves Recommended out when every model is installed, and keeps Installed", () => {
    const allInstalled = buildToolModels(
      input({
        image: [image({ id: "only", downloaded: true })],
        imageSelectedId: "only",
      }),
      titleOf,
    );
    const sections = selectorSections(allInstalled);
    expect(sections.map((section) => section.id)).toEqual(["installed"]);
    expect(sections[0]?.groups[0]?.rows).toHaveLength(1);
  });

  it("keeps Installed, empty, when nothing is installed", () => {
    const none = buildToolModels(input({ image: [image({ id: "a" })] }), titleOf);
    const sections = selectorSections(none);
    expect(sections.map((section) => section.id)).toEqual(["installed", "recommended"]);
    expect(sections[0]?.groups).toEqual([]);
  });

  it("puts the downloaded models in Installed and the rest in Recommended", () => {
    const [installed, recommended] = selectorSections(tools());
    expect(installed?.groups.flatMap((g) => g.rows.map((r) => r.model.id))).toEqual([
      "installed-image",
      "installed-stt",
    ]);
    expect(recommended?.groups.flatMap((g) => g.rows.map((r) => r.model.id))).toEqual([
      "missing-image",
      "missing-upscale",
    ]);
  });

  it("groups rows by tool in tool order and leaves out a tool with no row in a section", () => {
    const [installed] = selectorSections(tools());
    expect(installed?.groups.map((g) => g.title)).toEqual([
      "Text to image",
      "Audio: Speech to text",
    ]);
  });

  it("marks the row of the model the tool uses", () => {
    const [installed] = selectorSections(tools());
    const row = installed?.groups[0]?.rows[0];
    expect(row?.selected).toBe(true);
    expect(installed?.groups[1]?.rows[0]?.selected).toBe(false);
  });

  it("keeps the catalog and tool of each row, for its actions", () => {
    const [, recommended] = selectorSections(tools());
    const upscaleRow = recommended?.groups.find((g) => g.toolId === "playground-image-upscaling")
      ?.rows[0];
    expect(upscaleRow?.catalog).toBe("upscale");
    expect(upscaleRow?.toolId).toBe("playground-image-upscaling");
  });

  it("gives no rows for a tool whose catalog has not loaded", () => {
    const loading = buildToolModels(input({ image: null }), titleOf);
    const sections = selectorSections(loading);
    expect(
      sections.every((section) =>
        section.groups.every((g) => g.toolId !== "playground-text-to-image"),
      ),
    ).toBe(true);
  });
});

describe("selectorLabelOf", () => {
  it("is the current tool's selected model, or Select a model", () => {
    const tools = buildToolModels(
      input({ image: [image({ id: "a", name: "Model A" })], imageSelectedId: "a" }),
      titleOf,
    );
    expect(selectorLabelOf(toolOf(tools, "playground-text-to-image"))).toBe("Model A");
    expect(selectorLabelOf(toolOf(tools, "playground-image-upscaling"))).toBe("Select a model");
  });

  it("is Select a model on the landing, where no tool is chosen", () => {
    expect(selectorLabelOf(null)).toBe("Select a model");
  });
});
