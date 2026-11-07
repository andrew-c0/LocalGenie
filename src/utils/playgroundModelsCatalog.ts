import type {
  ImageModel,
  OcrModel,
  PlaygroundModelKind,
  SpeechModel,
  UpscaleModel,
} from "../types";
import { formatBytes } from "./format";
import { isImageToImageModel } from "./imageToImage";
import { SD_CPP_RUNTIME_ID } from "./playground";
import {
  collectInstalledPlaygroundModels,
  PLAYGROUND_GROUP_LABELS,
  PLAYGROUND_LOCAL_GROUPS,
  type PlaygroundCatalogs,
  type PlaygroundLocalGroup,
  speechGroupOf,
} from "./playgroundLocalModels";
import type { RuntimeNeed } from "./runtimeGuards";
import { SHERPA_RUNTIME_ID } from "./speech";

/** The tool filter of the Playground models page: every tool, or one group. */
export type ToolFilter = "all" | PlaygroundLocalGroup;

/** The installed filter of the Playground models page. */
export type InstalledFilter = "all" | "installed" | "notInstalled";

export const TOOL_FILTER_OPTIONS: [ToolFilter, string][] = [
  ["all", "All tools"],
  ...PLAYGROUND_LOCAL_GROUPS.map((group): [ToolFilter, string] => [
    group,
    PLAYGROUND_GROUP_LABELS[group],
  ]),
];

export const INSTALLED_FILTER_OPTIONS: [InstalledFilter, string][] = [
  ["all", "All"],
  ["installed", "Installed"],
  ["notInstalled", "Not installed"],
];

/** One curated Playground model as its row on the page shows it. */
export interface CatalogModelRow {
  id: string;
  name: string;
  /** The tool the model is listed under. */
  group: PlaygroundLocalGroup;
  /** The catalog it downloads from. */
  catalog: PlaygroundModelKind;
  description: string;
  installed: boolean;
  /** The download size, e.g. "1.2 GB". */
  sizeLabel: string;
  license: string;
  licenseUrl: string;
  /** The languages joined with commas, or "" when the catalog lists none. */
  languagesLabel: string;
  /** The "best for" line, or "" when the catalog has none. */
  bestFor: string;
}

function imageRows(models: ImageModel[]): CatalogModelRow[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    group: isImageToImageModel(model) ? "imageToImage" : "imageGeneration",
    catalog: "image",
    description: model.description,
    installed: model.downloaded,
    sizeLabel: formatBytes(model.totalBytes),
    license: model.license,
    licenseUrl: model.licenseUrl,
    languagesLabel: "",
    bestFor: "",
  }));
}

function upscaleRows(models: UpscaleModel[]): CatalogModelRow[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    group: "upscale",
    catalog: "upscale",
    description: model.description,
    installed: model.downloaded,
    sizeLabel: formatBytes(model.sizeBytes),
    license: model.license,
    licenseUrl: model.licenseUrl,
    languagesLabel: "",
    bestFor: model.bestFor,
  }));
}

function speechRows(models: SpeechModel[]): CatalogModelRow[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    group: speechGroupOf(model.kind),
    catalog: "speech",
    description: model.description,
    installed: model.downloaded,
    sizeLabel: formatBytes(model.sizeBytes),
    license: model.license,
    licenseUrl: model.licenseUrl,
    languagesLabel: model.languages.join(", "),
    bestFor: "",
  }));
}

function ocrRows(models: OcrModel[]): CatalogModelRow[] {
  return models.map((model) => ({
    id: model.id,
    name: model.name,
    group: "ocr",
    catalog: "ocr",
    description: model.description,
    installed: model.downloaded,
    sizeLabel: formatBytes(model.sizeBytes),
    license: model.license,
    licenseUrl: model.licenseUrl,
    languagesLabel: "",
    bestFor: model.bestFor,
  }));
}

/**
 * Every curated model of the four catalogs as a row, in catalog order. A catalog that has not loaded
 * (null) contributes no rows. Image models that take a picture are listed under image to image.
 */
export function buildCatalogRows(catalogs: PlaygroundCatalogs): CatalogModelRow[] {
  return [
    ...imageRows(catalogs.image ?? []),
    ...upscaleRows(catalogs.upscale ?? []),
    ...speechRows(catalogs.speech ?? []),
    ...ocrRows(catalogs.ocr ?? []),
  ];
}

export interface CatalogFilter {
  tool: ToolFilter;
  installed: InstalledFilter;
  /** The name search. Matched case-insensitively; surrounding spaces are ignored. */
  query: string;
}

/** The rows that pass every filter, in their order. */
export function filterCatalogRows(
  rows: CatalogModelRow[],
  filter: CatalogFilter,
): CatalogModelRow[] {
  const needle = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.tool === "all" || row.group === filter.tool) &&
      (filter.installed === "all" || (filter.installed === "installed") === row.installed) &&
      (!needle || row.name.toLowerCase().includes(needle)),
  );
}

/** One heading of the page: a tool and its rows, installed models first. */
export interface CatalogSection {
  group: PlaygroundLocalGroup;
  label: string;
  rows: CatalogModelRow[];
}

/** The sections in tool order. A tool with no row is left out. Installed rows come before the others. */
export function catalogSectionsOf(rows: CatalogModelRow[]): CatalogSection[] {
  return PLAYGROUND_LOCAL_GROUPS.map((group) => ({
    group,
    label: PLAYGROUND_GROUP_LABELS[group],
    rows: rows
      .filter((row) => row.group === group)
      .sort((a, b) => Number(b.installed) - Number(a.installed)),
  })).filter((section) => section.rows.length > 0);
}

/** The tool a `?tool=` value names, or "all" when it names none. */
export function toolFilterOf(value: string | null): ToolFilter {
  return PLAYGROUND_LOCAL_GROUPS.find((group) => group === value) ?? "all";
}

/** The number of curated models across the four catalogs, or null while any of them has not loaded. */
export function curatedCountOf(catalogs: PlaygroundCatalogs): number | null {
  const { image, upscale, speech, ocr } = catalogs;
  if (!image || !upscale || !speech || !ocr) return null;
  return image.length + upscale.length + speech.length + ocr.length;
}

/**
 * The Playground models row's fact on the Models landing: "N installed of M", where N counts every
 * installed Playground model (OCR included) and M the curated ones. Only N is shown until M is known.
 */
export function playgroundModelsFactOf(catalogs: PlaygroundCatalogs): string {
  const installed = collectInstalledPlaygroundModels(catalogs).length;
  const curated = curatedCountOf(catalogs);
  return curated === null ? `${installed} installed` : `${installed} installed of ${curated}`;
}

/** The runtime a tool's models need to run. The OCR models run on the GenieX server, so they need the CLI. */
export function runtimeNeedOf(group: PlaygroundLocalGroup): RuntimeNeed {
  switch (group) {
    case "imageGeneration":
    case "imageToImage":
    case "upscale":
      return SD_CPP_RUNTIME_ID;
    case "stt":
    case "tts":
    case "audioToAudio":
      return SHERPA_RUNTIME_ID;
    case "ocr":
      return "cli";
  }
}
