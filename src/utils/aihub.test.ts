import { describe, expect, it } from "vitest";
import {
  aihubFacets,
  aihubFolder,
  aihubModelName,
  aihubZipName,
  hfFileOf,
  humanLabel,
  isAssetForDevice,
} from "./aihub";

describe("aihub helpers", () => {
  it("turns enum labels into readable text", () => {
    expect(humanLabel("GENERATIVE_AI")).toBe("Generative ai");
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

describe("isAssetForDevice", () => {
  it("allows a universal asset on any device, and on a device with no chipset", () => {
    expect(isAssetForDevice(null, "Snapdragon X Elite CRD")).toBe(true);
    expect(isAssetForDevice(null, null)).toBe(true);
  });

  it("matches GenieX's display name to AI Hub's chipset name", () => {
    expect(isAssetForDevice("qualcomm-snapdragon-x-elite", "Snapdragon X Elite CRD")).toBe(true);
    expect(
      isAssetForDevice("qualcomm-snapdragon-8-elite-for-galaxy", "Snapdragon 8 Elite for Galaxy"),
    ).toBe(true);
    expect(isAssetForDevice("snapdragon_x2_elite", "Snapdragon_X2_Elite")).toBe(true);
  });

  it("refuses another chipset, including one whose name only starts the same way", () => {
    expect(isAssetForDevice("qualcomm-snapdragon-x-elite", "Snapdragon X2 Elite")).toBe(false);
    expect(isAssetForDevice("qualcomm-snapdragon-8-elite", "Snapdragon 8 Elite for Galaxy")).toBe(
      false,
    );
    expect(isAssetForDevice("qualcomm-snapdragon-x-elite", "Snapdragon X Plus 8 Core")).toBe(false);
  });

  it("refuses a chipset asset when the device has no chipset set", () => {
    expect(isAssetForDevice("qualcomm-snapdragon-x-elite", null)).toBe(false);
  });
});

describe("hfFileOf", () => {
  it("splits a Hugging Face file URL into its repo and file name", () => {
    expect(
      hfFileOf("https://huggingface.co/ggml-org/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_0.gguf"),
    ).toEqual({
      repoId: "ggml-org/Qwen3-0.6B-GGUF",
      filename: "Qwen3-0.6B-Q4_0.gguf",
    });
  });

  it("returns null for an AI Hub zip", () => {
    expect(hfFileOf("https://qaihub-public-assets.s3.us-west-2.amazonaws.com/a/x.zip")).toBeNull();
  });
});
