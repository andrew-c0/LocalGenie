import { describe, expect, it } from "vitest";
import {
  imageWorkKind,
  isSpeechTool,
  keepsSpeechAudio,
  PLAYGROUND_TOOL_IDS,
  type PlaygroundToolId,
  SPEECH_KINDS_BY_TOOL,
  WORK_BY_TOOL,
} from "./playgroundReset";

const TEXT: PlaygroundToolId = "playground-text-to-image";
const EDIT: PlaygroundToolId = "playground-image-to-image";
const UPSCALE: PlaygroundToolId = "playground-image-upscaling";
const OCR: PlaygroundToolId = "playground-ocr";
const STT: PlaygroundToolId = "playground-speech-to-text";
const TTS: PlaygroundToolId = "playground-text-to-speech";
const A2A: PlaygroundToolId = "playground-audio-to-audio";

describe("WORK_BY_TOOL", () => {
  it("lists work for every tool", () => {
    for (const tool of PLAYGROUND_TOOL_IDS) {
      expect(WORK_BY_TOOL[tool].length).toBeGreaterThan(0);
    }
  });

  it("gives each image and OCR tool its own parts, with no part shared", () => {
    const own = [TEXT, EDIT, UPSCALE, OCR].flatMap((tool) => WORK_BY_TOOL[tool]);
    expect(new Set(own).size).toBe(own.length);
  });

  it("shares the speech audio between the three speech tools only", () => {
    for (const tool of [STT, TTS, A2A]) {
      expect(WORK_BY_TOOL[tool]).toContain("speechAudio");
    }
    for (const tool of [TEXT, EDIT, UPSCALE, OCR]) {
      expect(WORK_BY_TOOL[tool]).not.toContain("speechAudio");
    }
  });

  it("gives each speech tool its own result kinds", () => {
    expect(SPEECH_KINDS_BY_TOOL[STT]).toEqual(["stt"]);
    expect(SPEECH_KINDS_BY_TOOL[TTS]).toEqual(["tts"]);
    expect(SPEECH_KINDS_BY_TOOL[A2A]).toEqual(["denoise", "separate"]);
    expect(isSpeechTool(STT)).toBe(true);
    expect(isSpeechTool(EDIT)).toBe(false);
  });
});

describe("imageWorkKind", () => {
  it("tells text to image work from image to image work", () => {
    expect(imageWorkKind({ kind: "generate", inputPath: null })).toBe("text");
    expect(imageWorkKind({ kind: "generate", inputPath: "C:/in/a.png" })).toBe("edit");
  });

  it("marks an upscale as its own kind, whatever its input", () => {
    expect(imageWorkKind({ kind: "upscale", inputPath: "C:/in/a.png" })).toBe("upscale");
  });

  it("is null for no work", () => {
    expect(imageWorkKind(null)).toBeNull();
  });
});

describe("keepsSpeechAudio", () => {
  it("keeps the audio when the user moves between speech tools", () => {
    expect(keepsSpeechAudio(STT, TTS)).toBe(true);
    expect(keepsSpeechAudio(A2A, STT)).toBe(true);
  });

  it("clears the audio when the user leaves for another tool or the Playground", () => {
    expect(keepsSpeechAudio(STT, EDIT)).toBe(false);
    expect(keepsSpeechAudio(TTS, null)).toBe(false);
  });

  it("never keeps audio for a tool that is not a speech tool", () => {
    expect(keepsSpeechAudio(EDIT, STT)).toBe(false);
  });
});
