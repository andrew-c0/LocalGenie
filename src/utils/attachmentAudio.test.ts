import { describe, expect, it } from "vitest";
import type { AttachmentFile } from "../types";
import { attachmentAudioUrl } from "./attachmentAudio";

function file(partial: Partial<AttachmentFile>): AttachmentFile {
  return {
    kind: "audio",
    name: "take.wav",
    size: 4,
    path: "C:/clips/take.wav",
    mime: "audio/wav",
    data: "UklGRg==",
    text: null,
    ...partial,
  };
}

describe("attachmentAudioUrl", () => {
  it("builds a base64 data URL from the MIME type and the bytes", () => {
    expect(attachmentAudioUrl(file({}))).toBe("data:audio/wav;base64,UklGRg==");
  });

  it("returns null when the audio has no data", () => {
    expect(attachmentAudioUrl(file({ data: null }))).toBeNull();
  });

  it("returns null when the MIME type is missing", () => {
    expect(attachmentAudioUrl(file({ mime: null }))).toBeNull();
  });

  it("returns null for a file that is not audio", () => {
    expect(attachmentAudioUrl(file({ kind: "text", text: "hi" }))).toBeNull();
    expect(attachmentAudioUrl(file({ kind: "image", mime: "image/png" }))).toBeNull();
  });
});
