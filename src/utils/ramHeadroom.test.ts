import { describe, expect, it } from "vitest";
import { isValidHeadroom, RAM_HEADROOM_DEFAULT, RAM_HEADROOM_RANGE } from "./ramHeadroom";

describe("isValidHeadroom", () => {
  it("accepts whole percentages from 0 to 50", () => {
    expect(isValidHeadroom(RAM_HEADROOM_RANGE.min)).toBe(true);
    expect(isValidHeadroom(RAM_HEADROOM_DEFAULT)).toBe(true);
    expect(isValidHeadroom(RAM_HEADROOM_RANGE.max)).toBe(true);
  });

  it("rejects values outside the range", () => {
    expect(isValidHeadroom(-1)).toBe(false);
    expect(isValidHeadroom(51)).toBe(false);
  });

  it("rejects fractions and an empty field", () => {
    expect(isValidHeadroom(10.5)).toBe(false);
    expect(isValidHeadroom(Number.NaN)).toBe(false);
    expect(isValidHeadroom(null)).toBe(false);
  });
});
