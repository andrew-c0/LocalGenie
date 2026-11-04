import { describe, expect, it } from "vitest";
import type { HubFacetSummary } from "../utils/hubModelInfo";
import { type AihubDownload, downloadSourceName, type RuntimeDownload } from "./downloadStore";

const FACETS: HubFacetSummary = {
  task: null,
  library: null,
  license: null,
  paramCount: null,
  paramCountApproximate: false,
  baseRelation: null,
  baseRepo: null,
  quantBits: [],
};

const aihubZip: AihubDownload = {
  modelName: "qualcomm/Model",
  downloadUrl: "https://example.test/model.zip",
  folder: "model",
  zipName: "model.zip",
  precision: "w4a16",
  facets: FACETS,
};

const runtimeInstall: RuntimeDownload = {
  runtimeId: "sd-cpp",
  displayName: "stable-diffusion.cpp",
};

describe("downloadSourceName", () => {
  it("names AI Hub for an AI Hub zip", () => {
    expect(downloadSourceName({ aihub: aihubZip, runtime: undefined })).toBe("Qualcomm AI Hub");
  });

  it("names GitHub for a runtime install", () => {
    expect(downloadSourceName({ aihub: undefined, runtime: runtimeInstall })).toBe("GitHub");
  });

  it("names Hugging Face for anything else", () => {
    expect(downloadSourceName({ aihub: undefined, runtime: undefined })).toBe("Hugging Face");
  });
});
