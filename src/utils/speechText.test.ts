import { describe, expect, it } from "vitest";
import { microphoneErrorMessage, speechPhaseLabel } from "./speechText";

describe("microphoneErrorMessage", () => {
  it("explains a denied permission and where to allow it", () => {
    const message = microphoneErrorMessage({ name: "NotAllowedError" });
    expect(message).toContain("denied");
    expect(message).toContain("Windows Settings");
  });

  it("says when no microphone is connected", () => {
    expect(microphoneErrorMessage({ name: "NotFoundError" })).toBe("No microphone was found.");
  });

  it("says when another app holds the microphone", () => {
    expect(microphoneErrorMessage({ name: "NotReadableError" })).toContain("another app");
  });

  it("uses the error's own message for other failures", () => {
    expect(microphoneErrorMessage(new Error("device lost"))).toBe("device lost");
  });

  it("falls back to a generic message for an unknown value", () => {
    expect(microphoneErrorMessage(42)).toBe("Could not start recording.");
  });
});

describe("speechPhaseLabel", () => {
  it("names the work of a transcription and of a speech synthesis differently", () => {
    expect(speechPhaseLabel("stt", "running")).toBe("Transcribing");
    expect(speechPhaseLabel("tts", "running")).toBe("Generating speech");
  });

  it("labels the loading and saving stages the same for both kinds", () => {
    expect(speechPhaseLabel("stt", "loading")).toBe(speechPhaseLabel("tts", "loading"));
    expect(speechPhaseLabel("stt", "saving")).toBe("Saving");
  });
});
