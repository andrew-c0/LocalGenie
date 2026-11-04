import type { DbDownloadedModel } from "../services/database";
import type { ModelInfo } from "../types";
import { formatBytes } from "./format";
import { modelSettingsKey } from "./modelSettings";
import { headroomBytes, ramCheck } from "./ramCheck";

/** The RAM a downloaded model needs, as stored with it. Bytes. */
export interface StoredRam {
  /** Weights, compute buffers and the vision projector. Does not depend on the context window. */
  baseBytes: number;
  /** KV cache for the context window saved for the model. */
  contextBytes: number;
  /** True when a flat factor stood in for a measured size, or the model's files could not be read. */
  approximate: boolean;
}

/** RAM figures the model selector reads, taken when it opens. */
export interface RamSnapshot {
  memory: { totalBytes: number; availableBytes: number };
  headroomPercent: number;
  /** The stored RAM per model, keyed by the model's settings key (no `:precision`). */
  ramByModel: Record<string, StoredRam>;
}

/** What a model row shows about its RAM. `warning` is the tooltip text, or null when there is none. */
export interface ModelRamLine {
  /** For example "RAM ~4.20 GB" or "RAM about 4.20 GB". */
  label: string;
  warning: string | null;
}

/**
 * The stored RAM of a downloaded model's row, or null until the figure is computed. A missing
 * context share counts as zero.
 */
export function storedRamOfRow(
  row: Pick<DbDownloadedModel, "base_ram_bytes" | "context_ram_bytes" | "ram_approximate">,
): StoredRam | null {
  if (row.base_ram_bytes === null) return null;
  return {
    baseBytes: row.base_ram_bytes,
    contextBytes: row.context_ram_bytes ?? 0,
    approximate: row.ram_approximate ?? false,
  };
}

/** The stored RAM as a short label, for example `RAM ~4.00 GB` or `RAM about 4.00 GB` when approximate. */
export function storedRamLabel(stored: StoredRam): string {
  const size = formatBytes(stored.baseBytes + stored.contextBytes);
  return `RAM ${stored.approximate ? "about " : "~"}${size}`;
}

/**
 * The estimated RAM line in the model settings, for the context window in the field: the stored base
 * plus the KV bytes for that window. `kvBytes` is null while it is read, and the stored context share
 * stands in then. Null when the model has no stored figure.
 */
export function estimatedRamLabel(
  stored: StoredRam | undefined,
  kvBytes: number | null,
): string | null {
  if (!stored) return null;
  const contextBytes = kvBytes ?? stored.contextBytes;
  const size = formatBytes(stored.baseBytes + contextBytes);
  return `Estimated RAM: ${stored.approximate ? "about " : "~"}${size}`;
}

/**
 * The RAM line for one model row, or null when there is no stored figure. The need is the stored base
 * plus the stored context share. A model that is already loaded is not checked: its RAM is already
 * out of the free figure, so a second check would count it twice.
 */
export function modelRamLine(
  snapshot: RamSnapshot | null,
  model: ModelInfo,
  loaded: boolean,
): ModelRamLine | null {
  if (!snapshot) return null;
  const stored = snapshot.ramByModel[modelSettingsKey(model.name)];
  if (!stored) return null;

  const needBytes = stored.baseBytes + stored.contextBytes;
  const label = storedRamLabel(stored);
  if (loaded) return { label, warning: null };

  const { memory, headroomPercent } = snapshot;
  const check = ramCheck(needBytes, memory.availableBytes, memory.totalBytes, headroomPercent);
  if (check.fits) return { label, warning: null };

  const keptFree = formatBytes(headroomBytes(memory.totalBytes, headroomPercent));
  return {
    label,
    warning: `Needs ~${formatBytes(needBytes)}, ${formatBytes(memory.availableBytes)} free, ${keptFree} kept free`,
  };
}
