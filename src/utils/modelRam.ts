import type { ModelInfo, ModelRamEstimate } from "../types";
import { formatBytes } from "./format";
import { headroomBytes, ramCheck } from "./ramCheck";

/** RAM figures the model selector reads, taken when it opens. */
export interface RamSnapshot {
  memory: { totalBytes: number; availableBytes: number };
  headroomPercent: number;
  /** Estimate rows per model name, one per precision. */
  rowsByModel: Record<string, ModelRamEstimate[]>;
}

/** What a model row shows about its RAM. `warning` is the tooltip text, or null when there is none. */
export interface ModelRamLine {
  /** For example "RAM ~4.20 GB" or "RAM about 4.20 GB". */
  label: string;
  warning: string | null;
}

/** The row for the precision the model row shows, else the first row. Null when there are no rows. */
export function pickModelRamRow(
  rows: ModelRamEstimate[],
  precision: string | undefined,
): ModelRamEstimate | null {
  return rows.find((row) => row.precision === precision) ?? rows[0] ?? null;
}

/**
 * The RAM line for one model row, or null when there is no estimate. A model that is already loaded
 * is not checked: its RAM is already out of the free figure, so a second check would count it twice.
 */
export function modelRamLine(
  snapshot: RamSnapshot | null,
  model: ModelInfo,
  loaded: boolean,
): ModelRamLine | null {
  if (!snapshot) return null;
  const row = pickModelRamRow(snapshot.rowsByModel[model.name] ?? [], model.precisions[0]);
  if (!row) return null;

  const size = formatBytes(row.totalBytes);
  const label = `RAM ${row.approximate ? "about " : "~"}${size}`;
  if (loaded) return { label, warning: null };

  const { memory, headroomPercent } = snapshot;
  const check = ramCheck(row.totalBytes, memory.availableBytes, memory.totalBytes, headroomPercent);
  if (check.fits) return { label, warning: null };

  const keptFree = formatBytes(headroomBytes(memory.totalBytes, headroomPercent));
  return {
    label,
    warning: `Needs ~${size}, ${formatBytes(memory.availableBytes)} free, ${keptFree} kept free`,
  };
}
