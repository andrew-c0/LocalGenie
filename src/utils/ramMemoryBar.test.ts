import { describe, expect, it } from "vitest";
import { clampPercent, memoryBarView } from "./ramMemoryBar";

const GB = 1_073_741_824;

function sum(values: { usedPercent: number; freePercent: number; keptFreePercent: number }) {
  return values.usedPercent + values.freePercent + values.keptFreePercent;
}

describe("clampPercent", () => {
  it("keeps values from 0 to 100 and maps NaN to 0", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(42)).toBe(42);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe("memoryBarView", () => {
  it("splits total RAM into used, free and kept-free segments", () => {
    // 16 GB total, 6 GB free, 10% kept free (1.6 GB) at the free end.
    const view = memoryBarView({ totalBytes: 16 * GB, availableBytes: 6 * GB }, 10);

    expect(view.segments.usedPercent).toBeCloseTo(62.5);
    expect(view.segments.keptFreePercent).toBeCloseTo(10);
    expect(view.segments.freePercent).toBeCloseTo(27.5);
    expect(sum(view.segments)).toBeCloseTo(100);
    expect(view.belowHeadroom).toBe(false);
  });

  it("caps the kept-free zone at the free share when the machine is below the headroom", () => {
    // 16 GB total, 1 GB free, 10% kept free (1.6 GB) is more than what is free.
    const view = memoryBarView({ totalBytes: 16 * GB, availableBytes: 1 * GB }, 10);

    expect(view.segments.keptFreePercent).toBeCloseTo(6.25);
    expect(view.segments.freePercent).toBeCloseTo(0);
    expect(sum(view.segments)).toBeCloseTo(100);
    expect(view.belowHeadroom).toBe(true);
  });

  it("draws no kept-free zone when the headroom is 0", () => {
    const view = memoryBarView({ totalBytes: 8 * GB, availableBytes: 2 * GB }, 0);

    expect(view.segments.keptFreePercent).toBe(0);
    expect(view.segments.freePercent).toBeCloseTo(25);
    expect(view.belowHeadroom).toBe(false);
  });

  it("clamps a headroom above 100 and a negative one to the bar", () => {
    const high = memoryBarView({ totalBytes: 8 * GB, availableBytes: 8 * GB }, 150);
    expect(high.segments.keptFreePercent).toBe(100);
    expect(high.segments.freePercent).toBe(0);

    const low = memoryBarView({ totalBytes: 8 * GB, availableBytes: 4 * GB }, -10);
    expect(low.segments.keptFreePercent).toBe(0);
    expect(low.labels.keptFree).toBe("Kept free 0 B (0 %)");
  });

  it("treats available memory above total as all free and clamps negative available to none", () => {
    const over = memoryBarView({ totalBytes: 4 * GB, availableBytes: 5 * GB }, 0);
    expect(over.segments.usedPercent).toBe(0);
    expect(over.segments.freePercent).toBe(100);

    const negative = memoryBarView({ totalBytes: 4 * GB, availableBytes: -1 }, 10);
    expect(negative.segments.usedPercent).toBe(100);
    expect(negative.segments.keptFreePercent).toBe(0);
    expect(negative.belowHeadroom).toBe(true);
  });

  it("shows zeros when the total is unknown", () => {
    const view = memoryBarView({ totalBytes: 0, availableBytes: 0 }, 10);

    expect(view.segments).toEqual({ usedPercent: 0, freePercent: 0, keptFreePercent: 0 });
    expect(view.belowHeadroom).toBe(false);
  });

  it("builds the labels from the figures", () => {
    const view = memoryBarView({ totalBytes: 16 * GB, availableBytes: 6 * GB }, 10);

    expect(view.labels).toEqual({
      total: "Total 16.00 GB",
      inUse: "In use 10.00 GB",
      free: "Free 6.00 GB",
      keptFree: "Kept free 1.60 GB (10 %)",
    });
  });
});
