import { describe, expect, it } from "vitest";
import {
  COMPACTION_DEFAULTS,
  COMPACTION_THRESHOLD_RANGE,
  isValidThreshold,
  resolveCompactionSettings,
} from "./compactionSettings";

describe("isValidThreshold", () => {
  it("accepts whole percentages from 50 to 90", () => {
    expect(isValidThreshold(COMPACTION_THRESHOLD_RANGE.min)).toBe(true);
    expect(isValidThreshold(70)).toBe(true);
    expect(isValidThreshold(COMPACTION_THRESHOLD_RANGE.max)).toBe(true);
  });

  it("rejects values outside the range", () => {
    expect(isValidThreshold(49)).toBe(false);
    expect(isValidThreshold(91)).toBe(false);
  });

  it("rejects fractions, non-numbers and an empty value", () => {
    expect(isValidThreshold(70.5)).toBe(false);
    expect(isValidThreshold(Number.NaN)).toBe(false);
    expect(isValidThreshold("70")).toBe(false);
    expect(isValidThreshold(null)).toBe(false);
    expect(isValidThreshold(undefined)).toBe(false);
  });
});

describe("resolveCompactionSettings", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(resolveCompactionSettings({ enabled: null, thresholdPercent: null })).toEqual(
      COMPACTION_DEFAULTS,
    );
    expect(COMPACTION_DEFAULTS).toEqual({ enabled: false, thresholdPercent: 70 });
  });

  it("keeps stored values that are valid", () => {
    expect(resolveCompactionSettings({ enabled: true, thresholdPercent: 85 })).toEqual({
      enabled: true,
      thresholdPercent: 85,
    });
  });

  it("falls back per value when one is of the wrong type or out of range", () => {
    expect(resolveCompactionSettings({ enabled: "yes", thresholdPercent: 85 })).toEqual({
      enabled: false,
      thresholdPercent: 85,
    });
    expect(resolveCompactionSettings({ enabled: true, thresholdPercent: 95 })).toEqual({
      enabled: true,
      thresholdPercent: 70,
    });
  });
});
