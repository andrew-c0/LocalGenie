import type { AihubAsset } from "../services/aihub";
import type { HubFacetSummary } from "./hubModelInfo";

/** Readable text for a proto enum label: `GENERATIVE_AI` -> `Generative ai`. */
export function humanLabel(raw: string): string {
  const text = raw.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Sorted distinct chipsets across the assets (null entries are left out). */
export function chipsetsOf(assets: AihubAsset[]): string[] {
  return [...new Set(assets.map((a) => a.chipset).filter((c): c is string => !!c))].sort();
}

/** Assets for the chosen chipset; `null` means every chipset. */
export function filterAssetsByChipset(assets: AihubAsset[], chipset: string | null): AihubAsset[] {
  if (chipset === null) return assets;
  return assets.filter((a) => a.chipset === chipset);
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

/** Assets grouped by precision, in the order they arrive (the Rust side sorts them). */
export function groupByPrecision(assets: AihubAsset[]): [string, AihubAsset[]][] {
  const groups = new Map<string, AihubAsset[]>();
  for (const a of assets) {
    const list = groups.get(a.precision);
    if (list) list.push(a);
    else groups.set(a.precision, [a]);
  }
  return [...groups.entries()];
}
