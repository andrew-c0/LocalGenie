import { describe, expect, it } from "vitest";
import type { AihubAsset } from "../services/aihub";
import {
  aihubFacets,
  aihubFolder,
  aihubModelName,
  aihubZipName,
  chipsetsOf,
  filterAssetsByChipset,
  groupByPrecision,
  humanLabel,
} from "./aihub";

const assets: AihubAsset[] = [
  { precision: "W4A16", chipset: null, downloadUrl: "https://h/u.zip" },
  { precision: "W4A16", chipset: "chip_b", downloadUrl: "https://h/b.zip" },
  { precision: "W8A16", chipset: "chip_a", downloadUrl: "https://h/a.zip" },
];

describe("aihub helpers", () => {
  it("turns enum labels into readable text", () => {
    expect(humanLabel("GENERATIVE_AI")).toBe("Generative ai");
  });

  it("lists distinct chipsets without the universal asset", () => {
    expect(chipsetsOf(assets)).toEqual(["chip_a", "chip_b"]);
  });

  it("filters by chipset, and null means all", () => {
    expect(filterAssetsByChipset(assets, null)).toHaveLength(3);
    expect(filterAssetsByChipset(assets, "chip_a")).toEqual([assets[2]]);
  });

  it("groups assets by precision in order", () => {
    const groups = groupByPrecision(assets);
    expect(groups.map(([p]) => p)).toEqual(["W4A16", "W8A16"]);
    expect(groups[0][1]).toHaveLength(2);
  });

  it("names the GenieX model after the AI Hub display name", () => {
    expect(aihubModelName("Qwen3-0.6B")).toBe("qualcomm/Qwen3-0.6B");
  });

  it("puts each model's zips in their own folder with a per-asset file name", () => {
    expect(aihubFolder("qwen3_0_6b")).toBe("aihub--qwen3_0_6b");
    expect(aihubZipName("qwen3_0_6b", "W4A16", "snapdragon_x2_elite")).toBe(
      "qwen3_0_6b-w4a16-snapdragon_x2_elite.zip",
    );
    expect(aihubZipName("qwen3_0_6b", "W4A16", null)).toBe("qwen3_0_6b-w4a16-any.zip");
  });

  it("stores the bit width of the precision as the quant facet", () => {
    expect(aihubFacets("W4A16").quantBits).toEqual([4]);
    expect(aihubFacets("W8A16").quantBits).toEqual([8]);
    expect(aihubFacets("FP16").quantBits).toEqual([]);
    expect(aihubFacets("W4A16").library).toBe("QAIRT");
  });
});
