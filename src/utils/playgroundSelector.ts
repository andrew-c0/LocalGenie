import type {
  EnhanceKind,
  ImageModel,
  OcrModel,
  PlaygroundModelKind,
  SpeechKind,
  SpeechModel,
  UpscaleModel,
} from "../types";
import { formatBytes } from "./format";
import { imageToImageModels, inputBadgeLabel } from "./imageToImage";
import { recommendationDetail } from "./modelRecommendations";
import { OCR_BEST_FOR_LABEL } from "./ocrText";
import { type SpeechSelection, speechModelsOfKind } from "./speech";
import { UPSCALE_BEST_FOR_LABEL } from "./upscaleText";

/** The seven Playground tools, by route id, in sidebar order. */
export const PLAYGROUND_TOOL_IDS = [
  "playground-text-to-image",
  "playground-image-to-image",
  "playground-image-upscaling",
  "playground-ocr",
  "playground-speech-to-text",
  "playground-text-to-speech",
  "playground-audio-to-audio",
] as const;

export type PlaygroundToolId = (typeof PLAYGROUND_TOOL_IDS)[number];

/** The tool a route id names, or null when the id is not a Playground tool. */
export function toolIdOf(routeId: string): PlaygroundToolId | null {
  return PLAYGROUND_TOOL_IDS.find((id) => id === routeId) ?? null;
}

/** The catalog each tool's models come from. Image to image shares the image catalog. */
const CATALOG_OF_TOOL: Record<PlaygroundToolId, PlaygroundModelKind> = {
  "playground-text-to-image": "image",
  "playground-image-to-image": "image",
  "playground-image-upscaling": "upscale",
  "playground-ocr": "ocr",
  "playground-speech-to-text": "speech",
  "playground-text-to-speech": "speech",
  "playground-audio-to-audio": "speech",
};

/** One model as the selector lists it. */
export interface SelectorModel {
  /** The catalog id. Unique within its tool's catalog. */
  id: string;
  name: string;
  /** The muted line under the name: size and notes, joined. */
  detail: string;
  downloaded: boolean;
}

/** One tool's models, read from the stores. */
export interface ToolModels {
  toolId: PlaygroundToolId;
  /** The tool's name in the selector, e.g. "Text to image". */
  title: string;
  catalog: PlaygroundModelKind;
  /** The models this tool lists, in catalog order. Null while its catalog loads. */
  models: SelectorModel[] | null;
  /** The model the tool uses, when it is in `models`. Null when none is chosen. */
  selected: SelectorModel | null;
}

/** The store values the tool lists are built from. */
export interface PlaygroundSelectorInput {
  image: ImageModel[] | null;
  imageSelectedId: string | null;
  upscale: UpscaleModel[] | null;
  upscaleSelectedId: string | null;
  ocr: OcrModel[] | null;
  ocrSelectedId: string | null;
  speech: SpeechModel[] | null;
  speechSelectedIds: SpeechSelection;
  /** The task the Audio to audio tab runs. It picks which speech models that tool lists. */
  enhanceKind: EnhanceKind;
}

/** A detail line of a model as the selector shows it: its size, then its notes. */
function speechDetail(model: SpeechModel): string {
  const languages = model.languages.length > 0 ? `Languages: ${model.languages.join(", ")}` : null;
  const voices = model.kind === "tts" ? `Voices: ${model.voices.length}` : null;
  return recommendationDetail([formatBytes(model.sizeBytes), languages, voices]);
}

function imageEntries(models: ImageModel[], withInputKind: boolean): SelectorModel[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    detail: recommendationDetail([
      formatBytes(model.totalBytes),
      withInputKind ? inputBadgeLabel(model.imageInput) : null,
    ]),
    downloaded: model.downloaded,
  }));
}

function upscaleEntries(models: UpscaleModel[]): SelectorModel[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    detail: recommendationDetail([
      formatBytes(model.sizeBytes),
      `${UPSCALE_BEST_FOR_LABEL}: ${model.bestFor}`,
    ]),
    downloaded: model.downloaded,
  }));
}

function ocrEntries(models: OcrModel[]): SelectorModel[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    detail: recommendationDetail([
      formatBytes(model.sizeBytes),
      `${OCR_BEST_FOR_LABEL}: ${model.bestFor}`,
    ]),
    downloaded: model.downloaded,
  }));
}

function speechEntries(models: SpeechModel[], kind: SpeechKind): SelectorModel[] {
  return speechModelsOfKind(models, kind).map((model) => ({
    id: model.id,
    name: model.name,
    detail: speechDetail(model),
    downloaded: model.downloaded,
  }));
}

/** The listed model with this id, or null when the id is not in the list. */
function selectedIn(models: SelectorModel[] | null, id: string | null): SelectorModel | null {
  if (!models || id === null) return null;
  return models.find((model) => model.id === id) ?? null;
}

function toolEntry(
  toolId: PlaygroundToolId,
  title: string,
  models: SelectorModel[] | null,
  selectedId: string | null,
): ToolModels {
  return {
    toolId,
    title,
    catalog: CATALOG_OF_TOOL[toolId],
    models,
    selected: selectedIn(models, selectedId),
  };
}

/**
 * Every Playground tool with the models it lists and the one it uses. The lists match the tools' own
 * pickers: text to image lists every image model, image to image only the models that take a picture,
 * and each speech tool lists its kind of speech model (audio to audio, the task it is set to).
 * `titleOf` gives a tool's name, from the route table.
 */
export function buildToolModels(
  input: PlaygroundSelectorInput,
  titleOf: (toolId: PlaygroundToolId) => string,
): ToolModels[] {
  const image = input.image ? imageEntries(input.image, false) : null;
  const editImage = input.image ? imageEntries(imageToImageModels(input.image), true) : null;
  const upscale = input.upscale ? upscaleEntries(input.upscale) : null;
  const ocr = input.ocr ? ocrEntries(input.ocr) : null;
  const speech = (kind: SpeechKind) => (input.speech ? speechEntries(input.speech, kind) : null);

  return [
    toolEntry(
      "playground-text-to-image",
      titleOf("playground-text-to-image"),
      image,
      input.imageSelectedId,
    ),
    toolEntry(
      "playground-image-to-image",
      titleOf("playground-image-to-image"),
      editImage,
      input.imageSelectedId,
    ),
    toolEntry(
      "playground-image-upscaling",
      titleOf("playground-image-upscaling"),
      upscale,
      input.upscaleSelectedId,
    ),
    toolEntry("playground-ocr", titleOf("playground-ocr"), ocr, input.ocrSelectedId),
    toolEntry(
      "playground-speech-to-text",
      titleOf("playground-speech-to-text"),
      speech("stt"),
      input.speechSelectedIds.stt,
    ),
    toolEntry(
      "playground-text-to-speech",
      titleOf("playground-text-to-speech"),
      speech("tts"),
      input.speechSelectedIds.tts,
    ),
    toolEntry(
      "playground-audio-to-audio",
      titleOf("playground-audio-to-audio"),
      speech(input.enhanceKind),
      input.speechSelectedIds[input.enhanceKind],
    ),
  ];
}

/** One model row of a section, with the tool it belongs to. */
export interface SelectorRow {
  toolId: PlaygroundToolId;
  catalog: PlaygroundModelKind;
  model: SelectorModel;
  /** The tool uses this model. */
  selected: boolean;
}

/** The rows of one tool in a section. */
export interface SelectorGroup {
  toolId: PlaygroundToolId;
  title: string;
  rows: SelectorRow[];
}

export type SelectorSectionId = "installed" | "recommended";

/** One section of the selector popover. */
export interface SelectorSection {
  id: SelectorSectionId;
  title: string;
  /** The tools with at least one row in this section, in tool order. */
  groups: SelectorGroup[];
}

function groupsOf(tools: ToolModels[], keep: (model: SelectorModel) => boolean): SelectorGroup[] {
  return tools
    .map((tool) => ({
      toolId: tool.toolId,
      title: tool.title,
      rows: (tool.models ?? []).filter(keep).map((model) => ({
        toolId: tool.toolId,
        catalog: tool.catalog,
        model,
        selected: tool.selected?.id === model.id,
      })),
    }))
    .filter((group) => group.rows.length > 0);
}

/**
 * The popover's sections in their order: Installed (the downloaded models, click to use) and then
 * Recommended (the catalog entries still to download). Each section lists the tools in tool order,
 * and a tool with no row in a section is left out of it. Installed is always there, so it can show
 * its empty note; Recommended is left out when nothing is left to download.
 */
export function selectorSections(tools: ToolModels[]): SelectorSection[] {
  const installed: SelectorSection = {
    id: "installed",
    title: "Installed",
    groups: groupsOf(tools, (model) => model.downloaded),
  };
  const recommended: SelectorSection = {
    id: "recommended",
    title: "Recommended",
    groups: groupsOf(tools, (model) => !model.downloaded),
  };
  return recommended.groups.length > 0 ? [installed, recommended] : [installed];
}

/** The trigger's label: the current tool's selected model, or "Select a model". */
export function selectorLabelOf(currentTool: ToolModels | null): string {
  return currentTool?.selected?.name ?? "Select a model";
}
