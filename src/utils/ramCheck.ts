/** Outcome of checking a model's RAM estimate against the RAM that is free now. */
export interface RamCheck {
  /** True when the RAM left after loading is at least the headroom. */
  fits: boolean;
  /** Free RAM left after loading, in bytes. Negative when the model is bigger than the free RAM. */
  freeAfterBytes: number;
  /** How far the load leaves the system below the headroom, in bytes. Zero when it fits. */
  shortByBytes: number;
}

/** The RAM to keep free: `headroomPercent` of the total. */
export function headroomBytes(totalBytes: number, headroomPercent: number): number {
  return (totalBytes * headroomPercent) / 100;
}

/**
 * Whether a model with `estimateBytes` of RAM fits. It fits when the free RAM left after loading
 * (`availableBytes - estimateBytes`) is at least the headroom share of `totalBytes`. A warning only:
 * nothing here blocks a load.
 */
export function ramCheck(
  estimateBytes: number,
  availableBytes: number,
  totalBytes: number,
  headroomPercent: number,
): RamCheck {
  const freeAfterBytes = availableBytes - estimateBytes;
  const keptFreeBytes = headroomBytes(totalBytes, headroomPercent);
  const fits = freeAfterBytes >= keptFreeBytes;
  return {
    fits,
    freeAfterBytes,
    shortByBytes: fits ? 0 : keptFreeBytes - freeAfterBytes,
  };
}
