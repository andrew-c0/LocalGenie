import { describe, expect, it } from "vitest";
import { estimateModelBytes, ramFitForBytes } from "../services/hubApi";
import { cardRamVerdict, cardRamVerdictFromBytes } from "./cardRam";

/** A 7B model: about 4.9 GB at 4-bit and 8.6 GB at 8-bit, with the estimator's overhead. */
const SEVEN_B = 7e9;
const GB = 1e9;

describe("cardRamVerdictFromBytes", () => {
  it("says fits when the file with overhead fits the free RAM", () => {
    const verdict = cardRamVerdictFromBytes(2 * GB, { totalBytes: 32e9, availableBytes: 20e9 });
    expect(verdict?.level).toBe("fits");
    expect(verdict?.label).toBe("Fits");
  });

  it("says tight when the file with overhead fits only the total RAM", () => {
    // 6 GB file -> 6.9 GB needed: over 90 % of 6 GB free, under 85 % of 10 GB total.
    const verdict = cardRamVerdictFromBytes(6 * GB, { totalBytes: 10e9, availableBytes: 6e9 });
    expect(verdict?.level).toBe("tight");
    expect(verdict?.label).toBe("Tight");
  });

  it("says may not fit when the file with overhead is larger than the total RAM allows", () => {
    const verdict = cardRamVerdictFromBytes(9 * GB, { totalBytes: 8e9, availableBytes: 5e9 });
    expect(verdict?.level).toBe("no");
    expect(verdict?.label).toBe("May not fit");
  });

  it("uses the RAM fit text as the detail", () => {
    const memory = { totalBytes: 8e9, availableBytes: 5e9 };
    const bytes = Math.round(2 * GB * 1.15);
    expect(cardRamVerdictFromBytes(2 * GB, memory)?.detail).toBe(
      ramFitForBytes(bytes, memory).label,
    );
  });

  it("returns null when the size is unknown or zero", () => {
    const memory = { totalBytes: 32e9, availableBytes: 20e9 };
    expect(cardRamVerdictFromBytes(null, memory)).toBeNull();
    expect(cardRamVerdictFromBytes(undefined, memory)).toBeNull();
    expect(cardRamVerdictFromBytes(0, memory)).toBeNull();
  });

  it("returns null when the memory is unknown", () => {
    expect(cardRamVerdictFromBytes(2 * GB, null)).toBeNull();
    expect(cardRamVerdictFromBytes(2 * GB, undefined)).toBeNull();
  });
});

describe("cardRamVerdict", () => {
  it("says the model fits up to 8-bit when 8-bit fits the free RAM", () => {
    const verdict = cardRamVerdict(SEVEN_B, { totalBytes: 32e9, availableBytes: 20e9 });
    expect(verdict?.level).toBe("fits");
    expect(verdict?.label).toBe("Fits up to 8-bit");
  });

  it("says the model fits at 4-bit when only 4-bit fits the free RAM", () => {
    const verdict = cardRamVerdict(SEVEN_B, { totalBytes: 16e9, availableBytes: 6e9 });
    expect(verdict?.level).toBe("fits");
    expect(verdict?.label).toBe("Fits at 4-bit");
  });

  it("still reports 4-bit when 8-bit is only tight", () => {
    const verdict = cardRamVerdict(SEVEN_B, { totalBytes: 16e9, availableBytes: 9e9 });
    expect(verdict?.level).toBe("fits");
    expect(verdict?.label).toBe("Fits at 4-bit");
  });

  it("says the model is tight at 4-bit when 4-bit fits only the total RAM", () => {
    const verdict = cardRamVerdict(SEVEN_B, { totalBytes: 8e9, availableBytes: 5e9 });
    expect(verdict?.level).toBe("tight");
    expect(verdict?.label).toBe("Tight at 4-bit");
  });

  it("says the model is too large when even 4-bit does not fit the total RAM", () => {
    const verdict = cardRamVerdict(SEVEN_B, { totalBytes: 4e9, availableBytes: 3e9 });
    expect(verdict?.level).toBe("no");
    expect(verdict?.label).toBe("Too large for this PC");
  });

  it("uses the 4-bit RAM fit text as the detail", () => {
    const memory = { totalBytes: 8e9, availableBytes: 5e9 };
    const bytes = estimateModelBytes(SEVEN_B, 4.85) ?? 0;
    expect(cardRamVerdict(SEVEN_B, memory)?.detail).toBe(ramFitForBytes(bytes, memory).label);
  });

  it("returns null when the parameter count is unknown or zero", () => {
    const memory = { totalBytes: 32e9, availableBytes: 20e9 };
    expect(cardRamVerdict(null, memory)).toBeNull();
    expect(cardRamVerdict(undefined, memory)).toBeNull();
    expect(cardRamVerdict(0, memory)).toBeNull();
  });

  it("returns null when the memory is unknown", () => {
    expect(cardRamVerdict(SEVEN_B, null)).toBeNull();
    expect(cardRamVerdict(SEVEN_B, undefined)).toBeNull();
  });
});
