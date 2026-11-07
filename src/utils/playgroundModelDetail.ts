import { hubModelPageUrl } from "../services/hubApi";
import type {
  AudioTask,
  EnhanceKind,
  ImageModel,
  OcrModel,
  SpeechModel,
  UpscaleModel,
} from "../types";
import { formatBytes } from "./format";
import { inputBadgeLabel, isImageToImageModel } from "./imageToImage";
import type { CapabilityBadge } from "./modelCapabilities";
import type { SpecCell } from "./modelSpecs";
import { OCR_MODE_LABEL } from "./ocrText";
import {
  PLAYGROUND_GROUP_LABELS,
  PLAYGROUND_LOCAL_GROUPS,
  type PlaygroundCatalogs,
  type PlaygroundLocalGroup,
  speechGroupOf,
} from "./playgroundLocalModels";
import type { PlaygroundToolId } from "./playgroundSelector";
import { sizeLabel } from "./playgroundText";
import { UPSCALE_FACTOR, UPSCALE_INPUT_MAX_SIDE } from "./upscale";

/** A curated Playground model with the catalog it came from. Image models sit under image or image to image. */
export type CatalogEntry =
  | { kind: "image"; model: ImageModel }
  | { kind: "upscale"; model: UpscaleModel }
  | { kind: "speech"; model: SpeechModel }
  | { kind: "ocr"; model: OcrModel };

/** One file a model downloads, as its Files section shows it. */
export interface PlaygroundModelFile {
  name: string;
  sizeLabel: string;
  /** The Hugging Face repo id, or the source page for a model that is one archive. */
  sourceLabel: string;
  sourceUrl: string;
}

/** Whether the model is on this machine, and whether its download is running. */
export interface PlaygroundInstallState {
  installed: boolean;
  downloading: boolean;
}

/** The sections of a Playground model's detail page, built from its catalog entry. */
export interface PlaygroundModelDetail {
  name: string;
  description: string;
  /** The facts card: the tool, size, licence, the key fact of the kind, and the install status. */
  facts: SpecCell[];
  /** What the model can do, as icons. Empty when the catalog says nothing more. */
  capabilities: CapabilityBadge[];
  /** The Specifications section: the model's settings, its voices or modes, and its source links. */
  specs: SpecCell[];
  files: PlaygroundModelFile[];
  /** The Hugging Face repo of the model card, or null when none is published. */
  cardRepo: string | null;
  sourceUrl: string;
}

/** What the detail page shows: its model, or why there is none yet. */
export type PlaygroundDetailStatus = "loading" | "error" | "notFound" | "ready";

/** The tool each group's models open in. */
const TOOL_OF_GROUP: Record<PlaygroundLocalGroup, PlaygroundToolId> = {
  imageGeneration: "playground-text-to-image",
  imageToImage: "playground-image-to-image",
  upscale: "playground-image-upscaling",
  stt: "playground-audio",
  tts: "playground-audio",
  audioToAudio: "playground-audio",
  ocr: "playground-ocr",
};

/** The Playground tool a model opens in, and the Audio tool's task and clean up or split kind to set first. */
export interface ToolTarget {
  toolId: PlaygroundToolId;
  /** The Audio tool's task. Null for the tools that have no task. */
  audioTask: AudioTask | null;
  /** The clean up or split kind a model sets. Null for every other model. */
  enhanceKind: EnhanceKind | null;
}

/** The group named by a route parameter, or null for a value that names none. */
export function groupOfParam(value: string | undefined): PlaygroundLocalGroup | null {
  return PLAYGROUND_LOCAL_GROUPS.find((group) => group === value) ?? null;
}

/** The group a catalog entry is listed under on the Playground models page. */
export function groupOfEntry(entry: CatalogEntry): PlaygroundLocalGroup {
  switch (entry.kind) {
    case "image":
      return isImageToImageModel(entry.model) ? "imageToImage" : "imageGeneration";
    case "upscale":
      return "upscale";
    case "speech":
      return speechGroupOf(entry.model.kind);
    case "ocr":
      return "ocr";
  }
}

/**
 * The entry of a model in one group. Ids are only unique within a catalog, so the group picks the catalog
 * as well. Null when no loaded catalog lists the model there.
 */
export function findCatalogEntry(
  catalogs: PlaygroundCatalogs,
  group: PlaygroundLocalGroup,
  modelId: string,
): CatalogEntry | null {
  const entries: CatalogEntry[] = [
    ...(catalogs.image ?? []).map((model): CatalogEntry => ({ kind: "image", model })),
    ...(catalogs.upscale ?? []).map((model): CatalogEntry => ({ kind: "upscale", model })),
    ...(catalogs.speech ?? []).map((model): CatalogEntry => ({ kind: "speech", model })),
    ...(catalogs.ocr ?? []).map((model): CatalogEntry => ({ kind: "ocr", model })),
  ];
  return (
    entries.find((entry) => entry.model.id === modelId && groupOfEntry(entry) === group) ?? null
  );
}

/** The address of a model's detail page. The id is encoded, so a slash in it stays in one segment. */
export function playgroundModelPathOf(group: PlaygroundLocalGroup, modelId: string): string {
  return `/models/playground/${group}/${encodeURIComponent(modelId)}`;
}

/** The tool a model opens in. The speech models set the Audio tool's task, and a clean up or split model its kind. */
export function toolTargetOf(entry: CatalogEntry): ToolTarget {
  const toolId = TOOL_OF_GROUP[groupOfEntry(entry)];
  if (entry.kind !== "speech") return { toolId, audioTask: null, enhanceKind: null };
  const kind = entry.model.kind;
  switch (kind) {
    case "stt":
      return { toolId, audioTask: "transcribe", enhanceKind: null };
    case "tts":
      return { toolId, audioTask: "speak", enhanceKind: null };
    case "denoise":
    case "separate":
      return { toolId, audioTask: "enhance", enhanceKind: kind };
  }
}

/**
 * Why the page has no model to show, or "ready" when it has one. A failed catalog read comes before
 * "not found": a model may be in the catalog that did not load, so the page does not say it is missing.
 */
export function detailStatusOf(
  entry: CatalogEntry | null,
  catalogs: PlaygroundCatalogs,
  failureCount: number,
): PlaygroundDetailStatus {
  if (entry) return "ready";
  if (failureCount > 0) return "error";
  const allLoaded = Object.values(catalogs).every((list) => list !== null);
  return allLoaded ? "notFound" : "loading";
}

/** The cells that have a value. Cells with none are left out of the page. */
function presentCells(cells: SpecCell[]): SpecCell[] {
  return cells.filter((cell) => Boolean(cell.value));
}

function sizeBytesOf(entry: CatalogEntry): number {
  return entry.kind === "image" ? entry.model.totalBytes : entry.model.sizeBytes;
}

function installStateLabel({ installed, downloading }: PlaygroundInstallState): string {
  if (installed) return "Installed";
  return downloading ? "Downloading" : "Not installed";
}

/** The fact that says what a model is for, in the kind's own terms: its resolution, scale, languages or modes. */
function keyFactOf(entry: CatalogEntry): SpecCell {
  switch (entry.kind) {
    case "image":
      return {
        label: "Resolution",
        value: sizeLabel(entry.model.defaults.width, entry.model.defaults.height),
      };
    case "upscale":
      return { label: "Scale", value: `${UPSCALE_FACTOR}x` };
    case "speech":
      return { label: "Languages", value: entry.model.languages.join(", ") };
    case "ocr":
      return {
        label: OCR_MODE_LABEL,
        value: entry.model.modes.map((mode) => mode.label).join(", "),
      };
  }
}

/** The facts every model shows, then its key fact and install status. Missing values read N/A on the page. */
function factsOf(entry: CatalogEntry, state: PlaygroundInstallState): SpecCell[] {
  return [
    { label: "Tool", value: PLAYGROUND_GROUP_LABELS[groupOfEntry(entry)] },
    { label: "Size", value: formatBytes(sizeBytesOf(entry)) },
    { label: "Licence", value: entry.model.license, href: entry.model.licenseUrl || null },
    keyFactOf(entry),
    { label: "Status", value: installStateLabel(state) },
  ];
}

function imageSpecsOf(model: ImageModel): SpecCell[] {
  return [
    {
      label: "Steps",
      value: String(model.defaults.steps),
    },
    {
      label: "CFG scale",
      value: model.cfgAdjustable
        ? String(model.defaults.cfgScale)
        : `${model.defaults.cfgScale} (fixed)`,
    },
    {
      label: "Negative prompt",
      value: model.supportsNegativePrompt ? "Supported" : "Not supported",
    },
    { label: "Input picture", value: inputBadgeLabel(model.imageInput) ?? "Text to image only" },
  ];
}

function speechSpecsOf(model: SpeechModel): SpecCell[] {
  return [
    { label: "Kind", value: PLAYGROUND_GROUP_LABELS[speechGroupOf(model.kind)] },
    {
      label: "Voices",
      value: model.needsReference
        ? "Copies the voice from a reference clip"
        : model.voices.map((voice) => voice.label).join(", "),
    },
  ];
}

/** The settings and the descriptive cells of a kind, before the links. */
function kindSpecsOf(entry: CatalogEntry): SpecCell[] {
  switch (entry.kind) {
    case "image":
      return imageSpecsOf(entry.model);
    case "upscale":
      return [
        { label: "Best for", value: entry.model.bestFor },
        { label: "Largest input side", value: `${UPSCALE_INPUT_MAX_SIDE} px` },
      ];
    case "ocr":
      return [{ label: "Best for", value: entry.model.bestFor }];
    case "speech":
      return speechSpecsOf(entry.model);
  }
}

function linkSpecsOf(entry: CatalogEntry): SpecCell[] {
  const { links } = entry.model;
  return [
    { label: "Source", value: links.sourceUrl, href: links.sourceUrl },
    { label: "Documentation", value: links.docsUrl, href: links.docsUrl },
  ];
}

/** The Specifications cells: the kind's own cells, then the links. Cells with no value are left out. */
function specsOf(entry: CatalogEntry): SpecCell[] {
  return presentCells([...kindSpecsOf(entry), ...linkSpecsOf(entry)]);
}

/** What an image model does: text to image when it takes no picture, edit or re-draw when it does, and a negative prompt. */
function imageCapabilitiesOf(model: ImageModel): CapabilityBadge[] {
  const badges: CapabilityBadge[] = [];
  if (model.imageInput === "none") {
    badges.push({ id: "textToImage", label: "Text to image: draws a picture from a prompt." });
  }
  if (model.imageInput === "reference") {
    badges.push({
      id: "imageEdit",
      label: "Image edit: changes a picture from a written instruction.",
    });
  }
  if (model.imageInput === "init") {
    badges.push({
      id: "redraw",
      label: "Image to image: re-draws a picture. The strength sets how much changes.",
    });
  }
  if (model.supportsNegativePrompt) {
    badges.push({
      id: "negativePrompt",
      label: "Negative prompt: steers the picture away from what is listed.",
    });
  }
  return badges;
}

/** What a speech model does. A text to speech model that copies a voice also clones one. */
function speechCapabilitiesOf(model: SpeechModel): CapabilityBadge[] {
  switch (model.kind) {
    case "stt":
      return [
        { id: "speechToText", label: "Speech to text: writes out the words in an audio file." },
      ];
    case "tts": {
      const speak: CapabilityBadge = {
        id: "textToSpeech",
        label: "Text to speech: speaks text aloud.",
      };
      if (!model.needsReference) return [speak];
      return [
        speak,
        { id: "voiceCloning", label: "Voice cloning: copies a voice from a reference clip." },
      ];
    }
    case "denoise":
      return [{ id: "denoise", label: "Noise removal: cleans background noise from audio." }];
    case "separate":
      return [
        {
          id: "stemSplit",
          label: "Stem split: separates a mix into its parts, such as vocals and music.",
        },
      ];
  }
}

/** What an OCR model reads: text, tables, or both, from the modes it offers. */
function ocrCapabilitiesOf(model: OcrModel): CapabilityBadge[] {
  const badges: CapabilityBadge[] = [];
  if (model.modes.some((mode) => mode.id === "text")) {
    badges.push({ id: "ocrText", label: "Reads text: turns a picture of a page into text." });
  }
  if (model.modes.some((mode) => mode.id === "table")) {
    badges.push({
      id: "ocrTables",
      label: "Reads tables: turns a table in a picture into rows and columns.",
    });
  }
  return badges;
}

/** The capability icons of a model, from its catalog entry. */
function capabilitiesOf(entry: CatalogEntry): CapabilityBadge[] {
  switch (entry.kind) {
    case "image":
      return imageCapabilitiesOf(entry.model);
    case "upscale":
      return [{ id: "upscale", label: `Upscale: enlarges a picture ${UPSCALE_FACTOR}x.` }];
    case "speech":
      return speechCapabilitiesOf(entry.model);
    case "ocr":
      return ocrCapabilitiesOf(entry.model);
  }
}

/** An image model lists one file per download. The other models are one archive with no file names in their catalog. */
function filesOf(entry: CatalogEntry): PlaygroundModelFile[] {
  if (entry.kind === "image") {
    return entry.model.files.map((file) => ({
      name: file.fileName,
      sizeLabel: formatBytes(file.sizeBytes),
      sourceLabel: file.source,
      sourceUrl: hubModelPageUrl(file.source),
    }));
  }
  const { model } = entry;
  return [
    {
      name: model.name,
      sizeLabel: formatBytes(model.sizeBytes),
      sourceLabel: model.links.sourceUrl,
      sourceUrl: model.links.sourceUrl,
    },
  ];
}

/** The detail page's sections, built from a catalog entry and the model's install state. */
export function playgroundModelDetailOf(
  entry: CatalogEntry,
  state: PlaygroundInstallState,
): PlaygroundModelDetail {
  const { model } = entry;
  return {
    name: model.name,
    description: model.description,
    facts: factsOf(entry, state),
    capabilities: capabilitiesOf(entry),
    specs: specsOf(entry),
    files: filesOf(entry),
    cardRepo: model.links.cardRepo,
    sourceUrl: model.links.sourceUrl,
  };
}
