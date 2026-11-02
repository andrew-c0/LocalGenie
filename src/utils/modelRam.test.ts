import { describe, expect, it } from "vitest";
import type { ModelInfo } from "../types";
import { modelRamLine, type RamSnapshot, type StoredRam } from "./modelRam";

const GB = 1_073_741_824;

function stored(overrides: Partial<StoredRam> = {}): StoredRam {
  return { baseBytes: 3 * GB, contextBytes: 1 * GB, approximate: false, ...overrides };
}

const model: ModelInfo = {
  name: "org/model",
  size: "4.0 GB",
  source: "hf",
  precisions: ["W4A16"],
};

// 16 GB total, 10% kept free (1.6 GB).
function snapshot(
  availableBytes: number,
  ram: Record<string, StoredRam> = { [model.name]: stored() },
): RamSnapshot {
  return {
    memory: { totalBytes: 16 * GB, availableBytes },
    headroomPercent: 10,
    ramByModel: ram,
  };
}

describe("modelRamLine", () => {
  it("is null without a snapshot or stored RAM for the model", () => {
    expect(modelRamLine(null, model, false)).toBeNull();
    expect(modelRamLine(snapshot(10 * GB, {}), model, false)).toBeNull();
  });

  it("adds the base and the context share, with a tilde when it is measured", () => {
    const line = modelRamLine(snapshot(10 * GB), model, false);
    expect(line?.label).toBe("RAM ~4.00 GB");
    expect(line?.warning).toBeNull();
  });

  it("finds the model by its settings key, ignoring a precision suffix", () => {
    const withSuffix: ModelInfo = { ...model, name: "org/model:W4A16" };
    expect(modelRamLine(snapshot(10 * GB), withSuffix, false)?.label).toBe("RAM ~4.00 GB");
  });

  it("says about when the figure is approximate", () => {
    const ram = { [model.name]: stored({ approximate: true }) };
    expect(modelRamLine(snapshot(10 * GB, ram), model, false)?.label).toBe("RAM about 4.00 GB");
  });

  it("has no warning when the load keeps the headroom free", () => {
    // 10 GB free minus 4 GB leaves 6 GB, more than 1.6 GB kept free.
    expect(modelRamLine(snapshot(10 * GB), model, false)?.warning).toBeNull();
  });

  it("warns with the need, the free RAM and the kept-free RAM when it does not fit", () => {
    // 5 GB free minus 4 GB leaves 1 GB, less than the 1.6 GB kept free.
    const line = modelRamLine(snapshot(5 * GB), model, false);
    expect(line?.warning).toBe("Needs ~4.00 GB, 5.00 GB free, 1.60 GB kept free");
  });

  it("does not check a model that is already loaded", () => {
    const line = modelRamLine(snapshot(5 * GB), model, true);
    expect(line?.label).toBe("RAM ~4.00 GB");
    expect(line?.warning).toBeNull();
  });
});
