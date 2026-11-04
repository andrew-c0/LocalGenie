import type { AihubCatalogEntry } from "../../../services/aihub";
import type { DbDownloadedModel } from "../../../services/database";
import type { SystemMemoryInfo } from "../../../services/system";
import type { ModelInfo } from "../../../types";
import {
  aihubCapabilityBadges,
  aihubCardInfoLines,
  aihubContextLength,
  humanLabel,
} from "../../../utils/aihub";
import { cardRamVerdict, cardRamVerdictFromBytes } from "../../../utils/cardRam";
import { formatContextLength, formatFullDate, formatRelativeDate } from "../../../utils/format";
import {
  type HubCapabilitySource,
  inferredCapabilities,
  inferredCapabilityBadges,
} from "../../../utils/hubCapabilities";
import {
  facetSummaryFromModel,
  formatParamCount,
  type HubFacetSource,
  parseFacets,
  sizeLabelOf,
  taskLabel,
} from "../../../utils/hubModelInfo";
import type { CapabilityBadge } from "../../../utils/modelCapabilities";
import { storedRamLabel, storedRamOfRow } from "../../../utils/modelRam";
import { sourceLabel } from "../../../utils/modelSource";
import type { FactKind, ModelCardData, ModelCardFact } from "./ModelCard";

/** The name of each fact kind, as the tooltip shows it. */
const FACT_LABEL: Record<FactKind, string> = {
  task: "Task",
  params: "Parameters",
  quant: "Quantisation",
  ctx: "Context window",
  licence: "Licence",
  disk: "Size on disk",
};

/** The tooltip of a fact: its name, the value, then the note in brackets when there is one. */
export function factTooltipText(fact: ModelCardFact): string {
  const base = `${FACT_LABEL[fact.kind]}: ${fact.text}`;
  return fact.note ? `${base} (${fact.note})` : base;
}

/**
 * The Hub fields a browse card reads. A Hub list row and a search result both carry them. The
 * GGUF context length is present only when the Hub returned the GGUF block.
 */
export type HubCardSource = HubFacetSource &
  HubCapabilitySource & {
    id: string;
    downloads?: number;
    likes?: number;
    gated?: boolean | string;
    lastModified?: string;
    gguf?: { context_length?: number };
  };

/** A fact, or nothing when the model does not have it. */
function fact(kind: FactKind, text: string | null | undefined, note?: string): ModelCardFact[] {
  return text ? [{ kind, text, note }] : [];
}

/**
 * Card of a Hugging Face model (browse list or search result). `downloaded` hides the downloads and
 * likes, as the repo is already on this device.
 */
export function hubCardData(
  model: HubCardSource,
  memory: SystemMemoryInfo | null,
  downloaded = false,
): ModelCardData {
  const facets = facetSummaryFromModel(model);
  const approximate = facets.paramCountApproximate;
  const verdict = cardRamVerdict(facets.paramCount, memory);
  const updated = formatRelativeDate(model.lastModified);
  const quant = facets.quantBits.length > 0 ? `${facets.quantBits.join(" / ")}-bit` : null;
  return {
    name: model.id,
    installed: false,
    gated: Boolean(model.gated),
    capabilityBadges: inferredCapabilityBadges(inferredCapabilities(model)),
    facts: [
      ...fact("task", facets.task ? taskLabel(facets.task) : null),
      ...fact("params", sizeLabelOf(facets), approximate ? "approximate" : undefined),
      ...fact("quant", quant, "from the 4-bit and 8-bit tags"),
      ...fact("ctx", formatContextLength(model.gguf?.context_length)),
      ...fact("licence", facets.license),
    ],
    ramVerdict: verdict && {
      ...verdict,
      detail: approximate ? `Estimate. ${verdict.detail}` : verdict.detail,
    },
    updated: updated ? { relative: updated, full: formatFullDate(model.lastModified) } : undefined,
    stats: downloaded ? undefined : { downloads: model.downloads, likes: model.likes },
  };
}

/**
 * Card of an AI Hub catalog entry. The headline and the info lines go in the info tooltip; without a
 * summary the tooltip names the chipset count. Catalog entries have no Hub stats and are not installed.
 */
export function aihubCardData(
  entry: AihubCatalogEntry,
  memory: SystemMemoryInfo | null,
): ModelCardData {
  const summary = entry.summary;
  const context = aihubContextLength(summary?.contextLengths ?? null);
  const lines = [summary?.headline, ...aihubCardInfoLines(summary)].filter((line): line is string =>
    Boolean(line),
  );
  return {
    name: entry.displayName,
    installed: false,
    capabilityBadges: aihubCapabilityBadges(summary),
    facts: [
      ...fact("task", entry.useCase ? humanLabel(entry.useCase) : null),
      ...fact("quant", summary?.quantization),
      ...fact("ctx", formatContextLength(context)),
    ],
    ramVerdict: cardRamVerdictFromBytes(summary?.modelSizeBytes, memory),
    details: lines.length > 0 ? lines : [`QAIRT · ${entry.chipsets.length} chipsets`],
  };
}

/**
 * Card of a downloaded model. The stored row supplies the facets, the precision, the context window
 * and the RAM figure; a row from before those were kept shows only what it has. The capability icons
 * come from the model's confirmed scan, so the caller passes them in.
 */
export function localCardData(
  model: ModelInfo,
  stored: DbDownloadedModel | undefined,
  capabilityBadges: CapabilityBadge[],
): ModelCardData {
  const facets = parseFacets(stored?.facets);
  const ram = stored ? storedRamOfRow(stored) : null;
  const sizeFromFacets = facets ? sizeLabelOf(facets) : null;
  const sizeText =
    sizeFromFacets ?? (stored?.param_count ? formatParamCount(stored.param_count) : null);
  const precision =
    stored?.precision ?? (model.precisions.length > 0 ? model.precisions.join(" / ") : null);
  return {
    name: model.name,
    installed: true,
    capabilityBadges,
    facts: [
      ...fact("task", facets?.task ? taskLabel(facets.task) : null),
      ...fact("params", sizeText, facets?.paramCountApproximate ? "approximate" : undefined),
      ...fact("quant", precision, "precision of the downloaded file"),
      ...fact("ctx", formatContextLength(stored?.context_size), "saved for the model"),
      ...fact("licence", facets?.license),
      ...fact("disk", model.size),
    ],
    ramVerdict: ram && {
      label: storedRamLabel(ram),
      detail: "Estimated from the model's files and its saved context window.",
    },
    details: [`Source: ${sourceLabel(model.source)}`],
  };
}
