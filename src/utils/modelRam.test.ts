import { describe, expect, it } from "vitest";
import type { ModelInfo, ModelRamEstimate } from "../types";
import { modelRamLine, pickModelRamRow, type RamSnapshot } from "./modelRam";

const GB = 1_073_741_824;

function row(overrides: Partial<ModelRamEstimate> = {}): ModelRamEstimate {
  return {
    name: "org/model",
    precision: "W4A16",
    weightsBytes: 4 * GB,
    kvBytes: 0,
    extraBytes: 0,
    totalBytes: 4 * GB,
    approximate: false,
    ...overrides,
  };
}

const model: ModelInfo = {
  name: "org/model",
  size: "4.0 GB",
  source: "hf",
  precisions: ["W4A16"],
};

// 16 GB total, 10% kept free (1.6 GB).
function snapshot(availableBytes: number, rows: ModelRamEstimate[] = [row()]): RamSnapshot {
  return {
    memory: { totalBytes: 16 * GB, availableBytes },
    headroomPercent: 10,
    rowsByModel: { [model.name]: rows },
  };
}

describe("pickModelRamRow", () => {
  it("picks the row for the given precision", () => {
    const rows = [row({ precision: "W4A16" }), row({ precision: "W8A16", totalBytes: 8 * GB })];
    expect(pickModelRamRow(rows, "W8A16")?.totalBytes).toBe(8 * GB);
  });

  it("falls back to the first row when no precision matches", () => {
    const rows = [row({ precision: "W4A16" })];
    expect(pickModelRamRow(rows, "Q5_K_M")?.precision).toBe("W4A16");
  });

  it("returns null when there are no rows", () => {
    expect(pickModelRamRow([], "W4A16")).toBeNull();
  });
});

describe("modelRamLine", () => {
  it("is null without a snapshot or an estimate for the model", () => {
    expect(modelRamLine(null, model, false)).toBeNull();
    expect(modelRamLine(snapshot(10 * GB, []), model, false)).toBeNull();
  });

  it("shows the estimate with a tilde when it is measured", () => {
    const line = modelRamLine(snapshot(10 * GB), model, false);
    expect(line?.label).toBe("RAM ~4.00 GB");
    expect(line?.warning).toBeNull();
  });

  it("says about when the estimate is approximate", () => {
    const line = modelRamLine(snapshot(10 * GB, [row({ approximate: true })]), model, false);
    expect(line?.label).toBe("RAM about 4.00 GB");
  });

  it("has no warning when the load keeps the headroom free", () => {
    // 10 GB free minus 4 GB estimate leaves 6 GB, more than 1.6 GB kept free.
    expect(modelRamLine(snapshot(10 * GB), model, false)?.warning).toBeNull();
  });

  it("says it will not load, with the need and the free RAM, when it does not fit", () => {
    // 5 GB free minus 4 GB leaves 1 GB, less than the 1.6 GB kept free.
    const line = modelRamLine(snapshot(5 * GB), model, false);
    expect(line?.label).toBe("Won't load: needs ~4.00 GB, 5.00 GB free");
  });

  it("gives the loader's refusal reason as the warning when it does not fit", () => {
    const line = modelRamLine(snapshot(5 * GB), model, false);
    expect(line?.warning).toBe("Needs about 4.00 GB, 5.00 GB free, 1.60 GB kept free");
  });

  it("counts the RAM of the model it replaces as free", () => {
    // 5 GB + 2 GB freed = 7 GB free, 3 GB left after loading: fits.
    const line = modelRamLine(snapshot(5 * GB), model, false, 2 * GB);
    expect(line?.label).toBe("RAM ~4.00 GB");
    expect(line?.warning).toBeNull();
  });

  it("says the replaced model stops in the warning when that is still not enough", () => {
    // 5 GB + 0.5 GB freed = 5.5 GB free, 1.5 GB left after loading: below the 1.6 GB kept free.
    const line = modelRamLine(snapshot(5 * GB), model, false, 0.5 * GB);
    expect(line?.label).toBe("Won't load: needs ~4.00 GB, 5.50 GB free");
    expect(line?.warning).toBe(
      "Needs about 4.00 GB, 5.50 GB free after the replaced model stops, 1.60 GB kept free",
    );
  });

  it("does not check a model that is already loaded", () => {
    const line = modelRamLine(snapshot(5 * GB), model, true);
    expect(line?.label).toBe("RAM ~4.00 GB");
    expect(line?.warning).toBeNull();
  });
});
