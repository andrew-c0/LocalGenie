import { describe, expect, it } from "vitest";
import { installStepOf, type SpeedSample, sampleSpeed } from "./runtimeInstall";

describe("installStepOf", () => {
  it("treats checking and downloading as the download step", () => {
    expect(installStepOf("checking")).toBe("download");
    expect(installStepOf("downloading")).toBe("download");
  });

  it("treats verifying, extracting and installing as the import step", () => {
    expect(installStepOf("verifying")).toBe("import");
    expect(installStepOf("extracting")).toBe("import");
    expect(installStepOf("installing")).toBe("import");
  });

  it("ends on done and error", () => {
    expect(installStepOf("done")).toBe("end");
    expect(installStepOf("error")).toBe("end");
  });
});

describe("sampleSpeed", () => {
  it("starts at speed 0 without a previous sample", () => {
    expect(sampleSpeed(undefined, 500, 1000)).toEqual({ received: 500, at: 1000, speed: 0 });
  });

  it("takes the rate of the first interval", () => {
    const first: SpeedSample = { received: 0, at: 0, speed: 0 };
    expect(sampleSpeed(first, 1000, 1000).speed).toBeCloseTo(1000);
  });

  it("smooths a new interval into the running speed", () => {
    const previous: SpeedSample = { received: 1000, at: 1000, speed: 1000 };
    // Instant rate is 2000 B/s; 0.3 * 2000 + 0.7 * 1000 = 1300.
    expect(sampleSpeed(previous, 3000, 2000).speed).toBeCloseTo(1300);
  });

  it("starts again at 0 when the byte count goes back (a new attempt)", () => {
    const previous: SpeedSample = { received: 5000, at: 1000, speed: 900 };
    expect(sampleSpeed(previous, 0, 2000).speed).toBe(0);
  });

  it("keeps the previous speed when no time has passed", () => {
    const previous: SpeedSample = { received: 1000, at: 1000, speed: 400 };
    expect(sampleSpeed(previous, 1500, 1000)).toEqual({ received: 1500, at: 1000, speed: 400 });
  });
});
