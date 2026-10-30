import { describe, expect, it } from "vitest";
import type { SpeechJob, SpeechModel } from "../types";
import {
  buildEnhanceRequest,
  DEFAULT_ENHANCE_KIND,
  enhanceJobOf,
  isEnhanceKind,
} from "./audioEnhance";

const job = (overrides: Partial<SpeechJob> = {}): SpeechJob => ({
  jobId: "job-5",
  kind: "denoise",
  modelId: "gtcrn-simple",
  startedAt: 0,
  phase: "running",
  ...overrides,
});

const gtcrn: SpeechModel = {
  id: "gtcrn-simple",
  kind: "denoise",
  name: "GTCRN simple",
  description: "",
  license: "",
  licenseUrl: "",
  sizeBytes: 500_000,
  languages: [],
  downloaded: true,
  voices: [],
};

describe("isEnhanceKind", () => {
  it("is true for the two audio to audio tasks only", () => {
    expect(isEnhanceKind("denoise")).toBe(true);
    expect(isEnhanceKind("separate")).toBe(true);
    expect(isEnhanceKind("stt")).toBe(false);
    expect(isEnhanceKind("tts")).toBe(false);
  });

  it("starts the tab on clean up speech", () => {
    expect(DEFAULT_ENHANCE_KIND).toBe("denoise");
  });
});

describe("enhanceJobOf", () => {
  it("returns a running clean-up or split job, so the tab can show it from either task", () => {
    expect(enhanceJobOf(job())).toEqual(job());
    expect(enhanceJobOf(job({ kind: "separate" }))).toEqual(job({ kind: "separate" }));
  });

  it("leaves out the speech to text and speech synthesis jobs", () => {
    expect(enhanceJobOf(job({ kind: "stt" }))).toBeNull();
    expect(enhanceJobOf(job({ kind: "tts" }))).toBeNull();
  });

  it("is null when no job runs", () => {
    expect(enhanceJobOf(null)).toBeNull();
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
