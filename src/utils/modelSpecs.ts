/**
 * What goes in the spec sections of a model page: the capability line, and the label and value of
 * each spec cell. Pure functions. A cell with no value is left out by the section that shows it, so a
 * builder returns a null value for a fact the model does not have.
 */

import type { AihubModelDetail } from "../services/aihub";
import type { DbDownloadedModel } from "../services/database";
import { type HubModel, hubModelPageUrl, precisionInfo } from "../services/hubApi";
import { humanLabel } from "./aihub";
import type { CardRamVerdict } from "./cardRam";
import { formatBytes, formatDay, formatWhole } from "./format";
import { formatParamCount, type HubFacetSummary, sizeLabelOf } from "./hubModelInfo";
import type { CapabilityBadge, CapabilityBadgeId } from "./modelCapabilities";
import { storedRamOfRow } from "./modelRam";

/** One label and value of a spec section. `href` makes the value a link to that URL. */
export interface SpecCell {
  label: string;
  value: string | null | undefined;
  href?: string | null;
}

/** The range of a repo's precisions, lowest bits first: `Q2_K to Q8_0`, with the bit span. */
export interface QuantisationRange {
  text: string;
  /** For example `2–8 bit`. Undefined when a precision has no known bit width. */
  bits?: string;
}

const CAPABILITY_MEANING: Record<CapabilityBadgeId, string> = {
  tools: "Tools: calls functions",
  thinking: "Thinking: reasoning mode",
  vision: "Vision: reads images",
  audio: "Audio: takes audio input",
  textToImage: "Text to image: draws from a prompt",
  imageEdit: "Image edit: changes a picture from an instruction",
  redraw: "Image to image: re-draws a picture",
  negativePrompt: "Negative prompt: steers away from unwanted content",
  upscale: "Upscale: enlarges pictures",
  speechToText: "Speech to text: writes out audio",
  textToSpeech: "Text to speech: speaks text",
  voiceCloning: "Voice cloning: copies a voice from a clip",
  denoise: "Noise removal: cleans audio",
  stemSplit: "Stem split: separates the parts of a mix",
  ocrText: "Reads text: from pictures",
  ocrTables: "Reads tables: into rows and columns",
};

/** The capabilities as a short plain-text line, in the order of the badges. Empty when there are none. */
export function capabilityMeaning(badges: CapabilityBadge[]): string {
  return badges.map((badge) => CAPABILITY_MEANING[badge.id]).join(" · ");
}

/** The repo's precisions as a range. Null when there are none. */
export function quantisationRangeOf(precisions: string[]): QuantisationRange | null {
  if (precisions.length === 0) return null;
  const bitsOf = (p: string) => precisionInfo(p).bitsPerWeight ?? Number.POSITIVE_INFINITY;
  const sorted = [...new Set(precisions)].sort((a, b) => bitsOf(a) - bitsOf(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const hasBits = Number.isFinite(bitsOf(first)) && Number.isFinite(bitsOf(last));
  return {
    text: sorted.length === 1 ? first : `${first} to ${last}`,
    bits: hasBits ? `${bitsOf(first)}–${bitsOf(last)} bit` : undefined,
  };
}

/** A yes or no cell. Null when the flag is unknown, so the cell is left out. */
function yesNoCell(label: string, flag: boolean | null): SpecCell {
  return { label, value: flag === null ? null : flag ? "Yes" : "No" };
}

/** The GenieX runtimes an AI Hub model runs on, as Yes/No cells. */
export function aihubCompatibilityCells(detail: AihubModelDetail): SpecCell[] {
  return [
    yesNoCell("QAIRT runtime", detail.genieCompatible),
    yesNoCell("llama.cpp runtime", detail.geniexLlamacppCompatible),
  ];
}

/** The domain, the use case, then each technical detail under its own label. */
export function aihubSpecCells(detail: AihubModelDetail): SpecCell[] {
  return [
    { label: "Domain", value: detail.domain ? humanLabel(detail.domain) : null },
    { label: "Use case", value: detail.useCase ? humanLabel(detail.useCase) : null },
    ...detail.technicalDetails.map((d) => ({ label: d.key, value: d.value })),
  ];
}

/** The RAM fit of this PC, as a cell. Null verdict (memory or size unknown) leaves the cell out. */
export function fitCell(verdict: CardRamVerdict | null, approximate = false): SpecCell {
  if (!verdict) return { label: "Fits this PC", value: null };
  return {
    label: "Fits this PC",
    value: approximate ? `${verdict.label} (estimate)` : verdict.label,
  };
}

/** A value as text. A list is joined with commas. Null when it is empty. */
function textOf(value: string | string[] | null | undefined): string | null {
  const parts = (Array.isArray(value) ? value : [value ?? ""]).map((v) => v.trim());
  const text = parts.filter((v) => v !== "").join(", ");
  return text === "" ? null : text;
}

/** A count as text with separators, `0` included. Null when the count is missing. */
function countText(count: number | null | undefined): string | null {
  return count == null ? null : formatWhole(count);
}

/** A token count as text, for example `40,960 tokens`. Null when missing or zero. */
function tokensText(tokens: number | null | undefined): string | null {
  return tokens ? `${formatWhole(tokens)} tokens` : null;
}

/** The repos this model is derived from: the card's `base_model`, else the base from the tags. */
function baseReposOf(model: HubModel, facets: HubFacetSummary): string[] {
  const fromCard = textOf(model.cardData?.base_model);
  if (fromCard) return fromCard.split(", ");
  return facets.baseRepo ? [facets.baseRepo] : [];
}

/**
 * The Specifications of a Hugging Face model. `facets` are the six facets of the page and
 * `precisions` the repo's file precisions (empty until the file list is read).
 */
export function hubSpecCells(
  model: HubModel,
  facets: HubFacetSummary,
  precisions: string[],
): SpecCell[] {
  const bases = baseReposOf(model, facets);
  const base = bases.length > 0 ? bases.join(", ") : null;
  const licence = facets.license ?? textOf(model.cardData?.license);
  return [
    { label: "Architecture", value: model.gguf?.architecture || null },
    { label: "Context length", value: tokensText(model.gguf?.context_length) },
    { label: "Parameters", value: sizeLabelOf(facets) },
    { label: "Quantisation range", value: quantisationRangeOf(precisions)?.text ?? null },
    { label: "Created", value: formatDay(model.createdAt) },
    { label: "Updated", value: formatDay(model.lastModified) },
    { label: "Downloads, last 30 days", value: countText(model.downloads) },
    { label: "Downloads, all time", value: countText(model.downloadsAllTime) },
    { label: "Likes", value: countText(model.likes) },
    { label: "Languages", value: textOf(model.cardData?.language) },
    {
      label: "Licence",
      value: licence,
      href: model.cardData?.license_link || null,
    },
    {
      label: "Base model",
      value: base,
      href: bases.length === 1 ? hubModelPageUrl(bases[0]) : null,
    },
    { label: "Quantised versions", value: countText(model.childrenModelCount?.quantized) },
  ];
}

/** Stored RAM as text: `~4.00 GB`, or `about 4.00 GB` when a flat factor stood in for the size. */
function ramText(row: DbDownloadedModel): string | null {
  const stored = storedRamOfRow(row);
  if (!stored) return null;
  const size = formatBytes(stored.baseBytes + stored.contextBytes);
  return `${stored.approximate ? "about " : "~"}${size}`;
}

/**
 * The Specifications of an installed model, from the row stored when it was downloaded. `row` is null
 * when the row is not found; `facets` are the stored facets. A value the row does not keep is left out.
 */
export function installedSpecCells(
  row: DbDownloadedModel | null,
  facets: HubFacetSummary | null,
): SpecCell[] {
  // The facets carry the size with its approximate mark; the row's own count is the fallback.
  const size = facets ? sizeLabelOf(facets) : null;
  const rowSize = row?.param_count ? formatParamCount(row.param_count) : null;
  return [
    { label: "Precision", value: row?.precision },
    { label: "Context window", value: tokensText(row?.context_size) },
    { label: "Parameters", value: size ?? rowSize },
    { label: "RAM needed", value: row ? ramText(row) : null },
  ];
}
