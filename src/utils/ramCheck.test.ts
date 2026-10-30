import { describe, expect, it } from "vitest";
import { headroomBytes, ramCheck } from "./ramCheck";

const GB = 1_073_741_824;

describe("headroomBytes", () => {
  it("is the headroom share of the total", () => {
    expect(headroomBytes(16 * GB, 10)).toBeCloseTo(1.6 * GB);
    expect(headroomBytes(16 * GB, 0)).toBe(0);
    expect(headroomBytes(16 * GB, 50)).toBe(8 * GB);
  });
});

describe("ramCheck", () => {
  // 16 GB total, 10% kept free = 1.6 GB.
  const total = 16 * GB;

  it("fits when the free RAM after loading is more than the headroom", () => {
    const check = ramCheck(4 * GB, 10 * GB, total, 10);
    expect(check.fits).toBe(true);
    expect(check.freeAfterBytes).toBe(6 * GB);
    expect(check.shortByBytes).toBe(0);
  });

  it("fits exactly at the headroom", () => {
    // 25% of 16 GB is 4 GB kept free: 10 GB available minus 6 GB estimate leaves exactly 4 GB.
    const check = ramCheck(6 * GB, 10 * GB, total, 25);
    expect(check.fits).toBe(true);
    expect(check.freeAfterBytes).toBe(4 * GB);
    expect(check.shortByBytes).toBe(0);
  });

  it("does not fit one byte below the headroom", () => {
    const check = ramCheck(6 * GB + 1, 10 * GB, total, 25);
    expect(check.fits).toBe(false);
    expect(check.shortByBytes).toBe(1);
  });

  it("reports how far short of the headroom the load leaves the system", () => {
    // 6 GB free, load 5 GB: 1 GB left, headroom 1.6 GB, so 0.6 GB short.
    const check = ramCheck(5 * GB, 6 * GB, total, 10);
    expect(check.fits).toBe(false);
    expect(check.freeAfterBytes).toBe(1 * GB);
    expect(check.shortByBytes).toBeCloseTo(0.6 * GB);
  });

  it("gives a negative free figure when the model is bigger than the free RAM", () => {
    const check = ramCheck(12 * GB, 10 * GB, total, 10);
    expect(check.fits).toBe(false);
    expect(check.freeAfterBytes).toBe(-2 * GB);
    expect(check.shortByBytes).toBeCloseTo(3.6 * GB);
  });

  it("with zero headroom, only a model bigger than the free RAM fails", () => {
    expect(ramCheck(10 * GB, 10 * GB, total, 0).fits).toBe(true);
    expect(ramCheck(10 * GB + 1, 10 * GB, total, 0).fits).toBe(false);
  });
});
