import type { ModelInfo, ModelRamEstimate } from "../types";
import { formatBytes } from "./format";
import { ramGateMessage } from "./ramGate";

/** RAM figures the model selector reads, taken when it opens. */
export interface RamSnapshot {
  memory: { totalBytes: number; availableBytes: number };
  headroomPercent: number;
  /** Estimate rows per model name, one per precision. */
  rowsByModel: Record<string, ModelRamEstimate[]>;
}

/** What a model row shows about its RAM. `warning` is the tooltip text, or null when there is none. */
export interface ModelRamLine {
  /** For example "RAM ~4.20 GB", or "Won't load: needs ~4.20 GB, 2.00 GB free" when it does not fit. */
  label: string;
  /** The same reason the loader gives when it refuses the load. Null when the model fits. */
  warning: string | null;
}

/** The row for the precision the model row shows, else the first row. Null when there are no rows. */
export function pickModelRamRow(
  rows: ModelRamEstimate[],
  precision: string | undefined,
): ModelRamEstimate | null {
  return rows.find((row) => row.precision === precision) ?? rows[0] ?? null;
}

/** Estimated RAM of a model at the precision its row shows, in bytes. Zero when there is no estimate. */
export function estimatedRamBytes(snapshot: RamSnapshot, model: ModelInfo): number {
  const rows = snapshot.rowsByModel[model.name] ?? [];
  return pickModelRamRow(rows, model.precisions[0])?.totalBytes ?? 0;
}

/**
 * The RAM line for one model row, or null when there is no estimate. A model that is already loaded
 * is not checked: its RAM is already out of the free figure, so a second check would count it twice.
 * `replacedBytes` is the RAM the model on the same compute gives back when it is unloaded for this one.
 */
export function modelRamLine(
  snapshot: RamSnapshot | null,
  model: ModelInfo,
  loaded: boolean,
  replacedBytes = 0,
): ModelRamLine | null {
  if (!snapshot) return null;
  const row = pickModelRamRow(snapshot.rowsByModel[model.name] ?? [], model.precisions[0]);
  if (!row) return null;

  const size = formatBytes(row.totalBytes);
  const label = `RAM ${row.approximate ? "about " : "~"}${size}`;
  if (loaded) return { label, warning: null };

  const { memory, headroomPercent } = snapshot;
  const warning = ramGateMessage({
    estimateBytes: row.totalBytes,
    memory,
    headroomPercent,
    freedBytes: replacedBytes,
  });
  if (warning === null) return { label, warning: null };

  const free = formatBytes(memory.availableBytes + replacedBytes);
  return { label: `Won't load: needs ~${size}, ${free} free`, warning };
}
