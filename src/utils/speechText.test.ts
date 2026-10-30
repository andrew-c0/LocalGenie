import { describe, expect, it } from "vitest";
import {
  microphoneErrorMessage,
  speechCancelledText,
  speechDoneTitle,
  speechFailedTitle,
  speechJobTitle,
  speechPhaseLabel,
} from "./speechText";

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

  it("names the work of each audio to audio task", () => {
    expect(speechPhaseLabel("denoise", "running")).toBe("Cleaning up speech");
    expect(speechPhaseLabel("separate", "running")).toBe("Splitting voice and music");
    expect(speechPhaseLabel("denoise", "saving")).toBe("Saving");
  });
});

describe("audio to audio job wording", () => {
  it("gives each task its own title, done, failed and cancelled text", () => {
    expect(speechJobTitle("denoise")).toBe("Cleaning up speech");
    expect(speechDoneTitle("separate")).toBe("Voice and music split");
    expect(speechFailedTitle("denoise")).toBe("Clean-up failed");
    expect(speechCancelledText("separate")).toBe("Split cancelled.");
  });

  it("keeps the speech to text and speech synthesis wording unchanged", () => {
    expect(speechDoneTitle("stt")).toBe("Transcript ready");
    expect(speechDoneTitle("tts")).toBe("Speech ready");
    expect(speechFailedTitle("tts")).toBe("Speech generation failed");
    expect(speechCancelledText("stt")).toBe("Transcription cancelled.");
  });
});
