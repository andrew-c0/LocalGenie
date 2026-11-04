import { describe, expect, it } from "vitest";
import type { PlaygroundDownloadView } from "../types";
import { downloadButtonLabelOf, recommendationDetail } from "./modelRecommendations";

const downloading = (overrides: Partial<PlaygroundDownloadView> = {}): PlaygroundDownloadView => ({
  status: "downloading",
  percent: null,
  error: null,
  source: "Hugging Face",
  ...overrides,
});

describe("recommendationDetail", () => {
  it("joins the non-empty parts", () => {
    expect(recommendationDetail(["1.0 GB", null, undefined, "Re-draw"])).toBe("1.0 GB · Re-draw");
  });

  it("is empty when no part is set", () => {
    expect(recommendationDetail([null, ""])).toBe("");
  });
});

describe("downloadButtonLabelOf", () => {
  it("reads Download when nothing is downloading", () => {
    expect(downloadButtonLabelOf(null)).toBe("Download");
  });

  it("reads Downloading while a download runs, with no percentage", () => {
    expect(downloadButtonLabelOf(downloading({ percent: 25 }))).toBe("Downloading");
    expect(downloadButtonLabelOf(downloading())).toBe("Downloading");
  });

  it("reads Download again after a failed or cancelled download", () => {
    expect(
      downloadButtonLabelOf({ status: "error", percent: null, error: "x", source: "GitHub" }),
    ).toBe("Download");
    expect(
      downloadButtonLabelOf({ status: "cancelled", percent: null, error: null, source: "GitHub" }),
    ).toBe("Download");
  });
});
