import type { AihubCardInfo, AihubModelDetail } from "../services/aihub";
import { formatBytes } from "./format";
import type { HubFacetSummary } from "./hubModelInfo";
import type { CapabilityBadge } from "./modelCapabilities";

/** Readable text for a proto enum label: `GENERATIVE_AI` -> `Generative ai`. */
export function humanLabel(raw: string): string {
  const text = raw.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The info line of an AI Hub card: quantisation, model size, input → output modalities and
 * context lengths, joined by ` · `. A missing fact is left out. Null when none is known.
 */
export function aihubCardInfoLine(summary: AihubCardInfo | null): string | null {
  if (!summary) return null;
  const parts: string[] = [];
  if (summary.quantization) parts.push(summary.quantization);
  if (summary.modelSizeBytes) parts.push(formatBytes(summary.modelSizeBytes));
  const input = summary.inputModalities.join(", ");
  const output = summary.outputModalities.join(", ");
  if (input && output) parts.push(`${input} → ${output}`);
  if (summary.contextLengths) parts.push(`Context ${summary.contextLengths}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The largest context length a catalog card lists, e.g. `512, 1024, 4096` -> 4096. Null when no
 * number is listed.
 */
export function aihubContextLength(contextLengths: string | null): number | null {
  const numbers = (contextLengths ?? "").match(/\d+/g)?.map(Number) ?? [];
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

/**
 * The capability icons of an AI Hub model, read from its input modalities: vision for an image
 * input, audio for an audio or speech input. The catalog says nothing about tools or thinking, so
 * neither gets an icon.
 */
export function aihubCapabilityBadges(
  summary: Pick<AihubCardInfo, "inputModalities"> | null,
): CapabilityBadge[] {
  const inputs = (summary?.inputModalities ?? []).map((m) => m.toLowerCase());
  const badges: CapabilityBadge[] = [];
  if (inputs.some((m) => m.includes("image"))) {
    badges.push({
      id: "vision",
      label: "Vision: takes images as input (from the AI Hub model info)",
    });
  }
  if (inputs.some((m) => m.includes("audio") || m.includes("speech"))) {
    badges.push({ id: "audio", label: "Audio: takes audio as input (from the AI Hub model info)" });
  }
  return badges;
}

/**
 * The lines of an AI Hub card below its description: the info line, then the languages when the
 * model lists them. Empty when there is nothing to show.
 */
export function aihubCardInfoLines(summary: AihubCardInfo | null): string[] {
  const info = aihubCardInfoLine(summary);
  const lines = info ? [info] : [];
  if (summary?.languages) lines.push(`Languages: ${summary.languages}`);
  return lines;
}

/**
 * The capability icons of an AI Hub detail page. The detail carries no card summary, so the input
 * modalities come from the technical detail that lists them (`text, image`).
 */
export function aihubDetailCapabilityBadges(detail: AihubModelDetail): CapabilityBadge[] {
  const listed = detail.technicalDetails.find((d) => d.key === "Supported Input Modalities");
  const inputModalities = (listed?.value ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m !== "");
  return aihubCapabilityBadges({ inputModalities });
}

/** The GenieX name of an AI Hub model: `qualcomm/<display name>`, the name `geniex pull` uses. */
export function aihubModelName(displayName: string): string {
  return `qualcomm/${displayName}`;
}

/** The Downloads folder that holds one AI Hub model's zip. */
export function aihubFolder(modelId: string): string {
  return `aihub--${modelId}`;
}

/** File name of one asset's zip, e.g. `qwen3_0_6b-w4a16-snapdragon_x2_elite.zip`. */
export function aihubZipName(modelId: string, precision: string, chipset: string | null): string {
  return `${modelId}-${precision}-${chipset ?? "any"}.zip`.toLowerCase();
}

/** Facets stored with an imported AI Hub model: the QAIRT runtime and the bit width of the
 *  precision (`W4A16` -> 4). The Hub's HF tags do not apply, so the other facets stay empty. */
export function aihubFacets(precision: string): HubFacetSummary {
  const bits = /^W(\d+)A/i.exec(precision);
  return {
    task: null,
    library: "QAIRT",
    license: null,
    paramCount: null,
    paramCountApproximate: false,
    baseRelation: null,
    baseRepo: null,
    quantBits: bits ? [Number(bits[1])] : [],
  };
}

/**
 * The repo and file of a Hugging Face file URL (`https://huggingface.co/<owner>/<repo>/resolve/main/<file>`),
 * which is how a llama.cpp GGUF asset is linked. Null for any other URL, such as an AI Hub zip.
 */
export function hfFileOf(url: string): { repoId: string; filename: string } | null {
  const match = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/main\/(.+)$/.exec(url);
  return match ? { repoId: match[1], filename: match[2] } : null;
}

/** Lower-case words of a chipset name, without the `qualcomm` vendor word. Mirrors the backend. */
function chipsetWords(name: string): string[] {
  return name
    .split(/[^a-z0-9]+/i)
    .filter((w) => w !== "" && w.toLowerCase() !== "qualcomm")
    .map((w) => w.toLowerCase());
}

/**
 * Whether an asset can be downloaded to a device with this chipset. Mirrors `asset_allowed` in the
 * backend, which makes the final call. A universal asset (null) is for any device. A chipset asset is
 * for the device's chipset, whose name may add one word, such as a SKU suffix (`Snapdragon X Elite CRD`).
 */
export function isAssetForDevice(
  assetChipset: string | null,
  deviceChipset: string | null,
): boolean {
  if (assetChipset === null) return true;
  const asset = chipsetWords(assetChipset);
  const device = deviceChipset ? chipsetWords(deviceChipset) : [];
  if (asset.length === 0 || device.length === 0) return false;
  const samePrefix = asset.every((word, i) => device[i] === word);
  return samePrefix && (device.length === asset.length || device.length === asset.length + 1);
}
