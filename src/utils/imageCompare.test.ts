import { describe, expect, it } from "vitest";
import {
  COMPARE_START_PERCENT,
  clampPercent,
  percentFromKey,
  percentFromPointer,
} from "./imageCompare";

describe("clampPercent", () => {
  it("keeps values inside 0 to 100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(120)).toBe(100);
    expect(clampPercent(37.5)).toBe(37.5);
  });

  it("keeps the edges", () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(100)).toBe(100);
  });

  it("counts a value that is not a number as 0", () => {
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe("percentFromPointer", () => {
  it("gives the middle of the box at its centre", () => {
    expect(percentFromPointer(150, 100, 100)).toBe(50);
  });

  it("gives 0 at the left edge and 100 at the right edge", () => {
    expect(percentFromPointer(100, 100, 200)).toBe(0);
    expect(percentFromPointer(300, 100, 200)).toBe(100);
  });

  it("clamps a pointer outside the box", () => {
    expect(percentFromPointer(50, 100, 200)).toBe(0);
    expect(percentFromPointer(400, 100, 200)).toBe(100);
  });

  it("is safe for a box with no width", () => {
    expect(percentFromPointer(150, 100, 0)).toBe(0);
    expect(percentFromPointer(150, 100, -10)).toBe(0);
  });
});

describe("percentFromKey", () => {
  it("starts at the middle", () => {
    expect(COMPARE_START_PERCENT).toBe(50);
  });

  it("moves by 2 with the arrows and by 10 with Shift", () => {
    expect(percentFromKey(50, "ArrowLeft", false)).toBe(48);
    expect(percentFromKey(50, "ArrowRight", false)).toBe(52);
    expect(percentFromKey(50, "ArrowLeft", true)).toBe(40);
    expect(percentFromKey(50, "ArrowRight", true)).toBe(60);
  });

  it("stops at the edges", () => {
    expect(percentFromKey(1, "ArrowLeft", false)).toBe(0);
    expect(percentFromKey(99, "ArrowRight", true)).toBe(100);
  });

  it("jumps to the ends with Home and End", () => {
    expect(percentFromKey(50, "Home", false)).toBe(0);
    expect(percentFromKey(50, "End", false)).toBe(100);
  });

  it("returns null for other keys", () => {
    expect(percentFromKey(50, "a", false)).toBeNull();
    expect(percentFromKey(50, "Enter", false)).toBeNull();
  });
});
