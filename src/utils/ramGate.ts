import { formatBytes } from "./format";
import { headroomBytes, ramCheck } from "./ramCheck";

export interface RamGateInput {
  /** Estimated RAM of the model to load, in bytes. Null when it could not be read. */
  estimateBytes: number | null;
  /** System RAM now. Null when it could not be read. */
  memory: { totalBytes: number; availableBytes: number } | null;
  /** Share of total RAM to keep free. */
  headroomPercent: number;
  /** RAM the model being replaced gives back when it stops, in bytes. Zero when nothing is replaced. */
  freedBytes: number;
}

/**
 * Why a load is refused for RAM, with the numbers to show, or null when it may go ahead. A load goes
 * ahead when either figure is unknown, so a missing estimate never blocks a model.
 */
export function ramGateMessage(input: RamGateInput): string | null {
  const { estimateBytes, memory, headroomPercent, freedBytes } = input;
  if (estimateBytes === null || memory === null) return null;
  const availableBytes = memory.availableBytes + freedBytes;
  const check = ramCheck(estimateBytes, availableBytes, memory.totalBytes, headroomPercent);
  if (check.fits) return null;
  const freeNote = freedBytes > 0 ? " after the replaced model stops" : "";
  const kept = formatBytes(headroomBytes(memory.totalBytes, headroomPercent));
  return `Needs about ${formatBytes(estimateBytes)}, ${formatBytes(availableBytes)} free${freeNote}, ${kept} kept free`;
}
