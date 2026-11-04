import { describe, expect, it } from "vitest";
import type { AihubCardInfo, AihubModelDetail } from "../services/aihub";
import {
  aihubCapabilityBadges,
  aihubCardInfoLine,
  aihubCardInfoLines,
  aihubContextLength,
  aihubDetailCapabilityBadges,
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

const CARD: AihubCardInfo = {
  headline: "Qwen3 0.6B",
  modelSizeBytes: 429 * 1024 * 1024,
  quantization: "Q4_0 (GGUF)",
  inputModalities: ["text"],
  outputModalities: ["text"],
  contextLengths: "512, 1024, 4096",
  languages: "100+ languages and dialects.",
};

describe("aihubCardInfoLine", () => {
  it("joins quantisation, size, modalities and context with dots", () => {
    expect(aihubCardInfoLine(CARD)).toBe(
      "Q4_0 (GGUF) · 429.0 MB · text → text · Context 512, 1024, 4096",
    );
  });

  it("leaves out the facts that are missing", () => {
    const sparse: AihubCardInfo = {
      ...CARD,
      quantization: null,
      contextLengths: null,
    };
    expect(aihubCardInfoLine(sparse)).toBe("429.0 MB · text → text");
  });

  it("returns null without a summary or with no facts", () => {
    expect(aihubCardInfoLine(null)).toBeNull();
    const empty: AihubCardInfo = {
      ...CARD,
      quantization: null,
      modelSizeBytes: null,
      inputModalities: [],
      outputModalities: [],
      contextLengths: null,
    };
    expect(aihubCardInfoLine(empty)).toBeNull();
  });

  it("does not show a modality arrow when one side is missing", () => {
    expect(aihubCardInfoLine({ ...CARD, outputModalities: [] })).toBe(
      "Q4_0 (GGUF) · 429.0 MB · Context 512, 1024, 4096",
    );
  });
});

describe("aihubCardInfoLines", () => {
  it("adds the languages line when the model lists languages", () => {
    expect(aihubCardInfoLines(CARD)).toEqual([
      "Q4_0 (GGUF) · 429.0 MB · text → text · Context 512, 1024, 4096",
      "Languages: 100+ languages and dialects.",
    ]);
  });

  it("is empty without a summary", () => {
    expect(aihubCardInfoLines(null)).toEqual([]);
  });
});

describe("aihubDetailCapabilityBadges", () => {
  const detailWith = (
    technicalDetails: AihubModelDetail["technicalDetails"],
  ): AihubModelDetail => ({
    id: "qwen3_0_6b",
    name: "Qwen3",
    headline: "",
    description: "",
    domain: "GENERATIVE_AI",
    useCase: "",
    licenseType: "",
    licenseUrl: null,
    sourceRepo: null,
    restrictModelSharing: false,
    callToAction: null,
    tags: [],
    technicalDetails,
    researchPaper: null,
    researchPaperTitle: null,
    applicableScenarios: [],
    genieCompatible: null,
    geniexLlamacppCompatible: null,
    assets: null,
  });

  it("reads the input modalities from the technical details", () => {
    const detail = detailWith([
      { key: "Supported Input Modalities", value: "text, image" },
      { key: "Model Size", value: "429 MB" },
    ]);
    expect(aihubDetailCapabilityBadges(detail).map((b) => b.id)).toEqual(["vision"]);
  });

  it("shows nothing when the model lists no input modalities", () => {
    expect(aihubDetailCapabilityBadges(detailWith([]))).toEqual([]);
  });
});

describe("aihubContextLength", () => {
  it("returns the largest length the card lists", () => {
    expect(aihubContextLength("512, 1024, 4096")).toBe(4096);
    expect(aihubContextLength("8192")).toBe(8192);
  });

  it("returns null when no length is listed", () => {
    expect(aihubContextLength(null)).toBeNull();
    expect(aihubContextLength("")).toBeNull();
  });
});

describe("aihubCapabilityBadges", () => {
  const withInputs = (inputModalities: string[]): AihubCardInfo => ({ ...CARD, inputModalities });

  it("shows vision for an image input and audio for an audio or speech input", () => {
    expect(aihubCapabilityBadges(withInputs(["text", "image"])).map((b) => b.id)).toEqual([
      "vision",
    ]);
    expect(aihubCapabilityBadges(withInputs(["speech"])).map((b) => b.id)).toEqual(["audio"]);
    expect(aihubCapabilityBadges(withInputs(["Audio", "Image"])).map((b) => b.id)).toEqual([
      "vision",
      "audio",
    ]);
  });

  it("shows nothing for a text-only model, and no tools or thinking", () => {
    expect(aihubCapabilityBadges(withInputs(["text"]))).toEqual([]);
    expect(aihubCapabilityBadges(null)).toEqual([]);
  });

  it("labels each icon as coming from the AI Hub model info", () => {
    for (const badge of aihubCapabilityBadges(withInputs(["image", "audio"]))) {
      expect(badge.label).toMatch(/\(from the AI Hub model info\)$/);
    }
  });
});
