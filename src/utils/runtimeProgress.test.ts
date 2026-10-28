import { describe, expect, it } from "vitest";
import type { RuntimeInstallProgress } from "../types";
import { runtimeProgressLabel, runtimeProgressPercent } from "./runtimeProgress";

const progress = (overrides: Partial<RuntimeInstallProgress>): RuntimeInstallProgress => ({
  id: "stable-diffusion-cpp",
  stage: "downloading",
  received: 0,
  total: 0,
  message: "",
  ...overrides,
});

describe("runtimeProgressPercent", () => {
  it("rounds the received share of the total", () => {
    expect(runtimeProgressPercent({ received: 1, total: 3 })).toBe(33);
    expect(runtimeProgressPercent({ received: 2, total: 3 })).toBe(67);
  });

  it("is null when the total is unknown, so the bar can be indeterminate", () => {
    expect(runtimeProgressPercent({ received: 500, total: 0 })).toBeNull();
  });

  it("clamps to 100 when more bytes arrive than the total reports", () => {
    expect(runtimeProgressPercent({ received: 120, total: 100 })).toBe(100);
  });

  it("is 0 before anything is received", () => {
    expect(runtimeProgressPercent({ received: 0, total: 100 })).toBe(0);
  });
});

describe("runtimeProgressLabel", () => {
  it("adds the byte counts while downloading with a known total", () => {
    const label = runtimeProgressLabel(
      progress({ received: 12 * 1_048_576, total: 63 * 1_048_576 }),
    );
    expect(label).toBe("Downloading 12.0 MB of 63.0 MB");
  });

  it("shows only the stage name when the total is unknown", () => {
    expect(runtimeProgressLabel(progress({ received: 500, total: 0 }))).toBe("Downloading");
  });

  it("shows only the stage name for stages without a byte count", () => {
    expect(runtimeProgressLabel(progress({ stage: "extracting", received: 5, total: 10 }))).toBe(
      "Extracting",
    );
    expect(runtimeProgressLabel(progress({ stage: "checking" }))).toBe("Checking release");
  });
});
