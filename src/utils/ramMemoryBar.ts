import { formatBytes } from "./format";
import { headroomBytes } from "./ramCheck";

/** Total and available system RAM, in bytes. */
export interface MemoryFigures {
  totalBytes: number;
  availableBytes: number;
}

/** Widths of the three stacked segments, each in percent of total RAM. They add up to 100. */
interface MemoryBarSegments {
  usedPercent: number;
  freePercent: number;
  keptFreePercent: number;
}

/** Everything the RAM headroom bar shows for one headroom share. */
export interface MemoryBarView {
  segments: MemoryBarSegments;
  labels: {
    total: string;
    inUse: string;
    free: string;
    keptFree: string;
  };
  /** True when the free RAM is already below the kept-free share. */
  belowHeadroom: boolean;
}

/** Clamps a percentage to 0 to 100. A NaN becomes 0. */
export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * The stacked bar for total RAM: used (total minus available) on the left, free RAM in the middle,
 * and the kept-free zone at the free end. The zone is `headroomPercent` of total, capped at the free
 * share, so it never runs past the free segment. Labels use the raw figures, not the clamped ones.
 */
export function memoryBarView(memory: MemoryFigures, headroomPercent: number): MemoryBarView {
  const totalBytes = Math.max(0, memory.totalBytes);
  const availableBytes = Math.min(Math.max(0, memory.availableBytes), totalBytes);
  const inUseBytes = totalBytes - availableBytes;
  const keptPercent = clampPercent(headroomPercent);
  const keptFreeBytes = headroomBytes(totalBytes, keptPercent);

  const usedPercent = totalBytes > 0 ? clampPercent((inUseBytes / totalBytes) * 100) : 0;
  const availablePercent = totalBytes > 0 ? clampPercent((availableBytes / totalBytes) * 100) : 0;
  const keptFreePercent = Math.min(keptPercent, availablePercent);
  const freePercent = availablePercent - keptFreePercent;

  return {
    segments: { usedPercent, freePercent, keptFreePercent },
    labels: {
      total: `Total ${formatBytes(totalBytes)}`,
      inUse: `In use ${formatBytes(inUseBytes)}`,
      free: `Free ${formatBytes(availableBytes)}`,
      keptFree: `Kept free ${formatBytes(keptFreeBytes)} (${keptPercent} %)`,
    },
    belowHeadroom: keptFreeBytes > availableBytes,
  };
}
