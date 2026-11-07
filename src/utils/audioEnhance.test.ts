import { describe, expect, it } from "vitest";
import type { SpeechModel } from "../types";
import { buildEnhanceRequest, DEFAULT_ENHANCE_KIND, isEnhanceKind } from "./audioEnhance";

const gtcrn: SpeechModel = {
  id: "gtcrn-simple",
  kind: "denoise",
  name: "GTCRN simple",
  description: "",
  license: "",
  licenseUrl: "",
  links: { cardRepo: null, sourceUrl: "", docsUrl: null },
  sizeBytes: 500_000,
  languages: [],
  downloaded: true,
  voices: [],
  needsReference: false,
};

describe("isEnhanceKind", () => {
  it("is true for the two audio to audio tasks only", () => {
    expect(isEnhanceKind("denoise")).toBe(true);
    expect(isEnhanceKind("separate")).toBe(true);
    expect(isEnhanceKind("stt")).toBe(false);
    expect(isEnhanceKind("tts")).toBe(false);
  });

  it("starts the task on clean up speech", () => {
    expect(DEFAULT_ENHANCE_KIND).toBe("denoise");
  });
});

describe("buildEnhanceRequest", () => {
  it("sends the model, the file and the job id, with the file path as chosen", () => {
    expect(
      buildEnhanceRequest("job-6", gtcrn, {
        audioPath: "C:\\clips\\noisy.wav",
        audioName: "noisy.wav",
      }),
    ).toEqual({
      jobId: "job-6",
      modelId: "gtcrn-simple",
      audioPath: "C:\\clips\\noisy.wav",
    });
  });
});
