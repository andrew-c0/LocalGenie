import { describe, expect, it } from "vitest";
import { spinNumber } from "./spinValue";

describe("spinNumber", () => {
  it("returns the value an arrow button reports", () => {
    expect(spinNumber({ value: 4608 })).toBe(4608);
  });

  it("reads a typed number from the display value", () => {
    expect(spinNumber({ value: undefined, displayValue: "8192" })).toBe(8192);
    expect(spinNumber({ value: null, displayValue: " 0.7 " })).toBe(0.7);
  });

  it("returns null for a cleared or non-numeric field", () => {
    expect(spinNumber({ value: undefined, displayValue: "" })).toBeNull();
    expect(spinNumber({ value: null })).toBeNull();
    expect(spinNumber({ value: undefined, displayValue: "abc" })).toBeNull();
  });

  it("clamps to the bounds", () => {
    expect(spinNumber({ value: undefined, displayValue: "999999" }, 512, 32768)).toBe(32768);
    expect(spinNumber({ value: undefined, displayValue: "10" }, 512, 32768)).toBe(512);
    expect(spinNumber({ value: 700 }, 512, 600)).toBe(600);
  });
});
