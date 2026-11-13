import { describe, expect, it } from "vitest";
import {
  COMPACTION_DEFAULTS,
  COMPACTION_THRESHOLD_RANGE,
  compactionChoiceOf,
  compactionOverrideOf,
  describeCompaction,
  effectiveCompaction,
  isValidThreshold,
  resolveCompactionSettings,
} from "./compactionSettings";

const app = { enabled: false, thresholdPercent: 70 };

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

describe("effectiveCompaction", () => {
  it("uses the app setting when the chat sets nothing", () => {
    expect(effectiveCompaction(app, undefined)).toEqual(app);
    expect(effectiveCompaction(app, {})).toEqual(app);
  });

  it("takes the chat's switch over the app's, both ways", () => {
    expect(effectiveCompaction(app, { compaction: true }).enabled).toBe(true);
    expect(effectiveCompaction({ ...app, enabled: true }, { compaction: false }).enabled).toBe(
      false,
    );
  });

  it("takes the chat's threshold over the app's, and keeps the app's switch", () => {
    expect(effectiveCompaction(app, { compactionThreshold: 85 })).toEqual({
      enabled: false,
      thresholdPercent: 85,
    });
  });

  it("ignores a chat threshold outside the range", () => {
    expect(effectiveCompaction(app, { compactionThreshold: 95 }).thresholdPercent).toBe(70);
    expect(effectiveCompaction(app, { compactionThreshold: 70.5 }).thresholdPercent).toBe(70);
  });
});

describe("compactionChoiceOf and compactionOverrideOf", () => {
  it("maps an absent switch to the app choice, and back", () => {
    expect(compactionChoiceOf(undefined)).toBe("app");
    expect(compactionChoiceOf(true)).toBe("on");
    expect(compactionChoiceOf(false)).toBe("off");
    expect(compactionOverrideOf("app")).toBeUndefined();
    expect(compactionOverrideOf("on")).toBe(true);
    expect(compactionOverrideOf("off")).toBe(false);
  });
});

describe("describeCompaction", () => {
  it("says on with its threshold, or off", () => {
    expect(describeCompaction({ enabled: true, thresholdPercent: 70 })).toBe(
      "on, at 70% of the window",
    );
    expect(describeCompaction(app)).toBe("off");
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
