import { describe, expect, it } from "vitest";
import { spinDisplayValue, spinNumber } from "./spinValue";

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

describe("spinDisplayValue", () => {
  it("shows the given number of decimals, so the default repetition penalty reads 1.05", () => {
    expect(spinDisplayValue(1.05, 2)).toBe("1.05");
  });

  it("keeps a trailing zero to the decimal count", () => {
    expect(spinDisplayValue(1.1, 2)).toBe("1.10");
    expect(spinDisplayValue(0.3, 1)).toBe("0.3");
  });

  it("shows a whole number with no decimal point when there are none", () => {
    expect(spinDisplayValue(2, 0)).toBe("2");
  });
});
