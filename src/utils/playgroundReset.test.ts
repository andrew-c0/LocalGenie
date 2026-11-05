import { describe, expect, it } from "vitest";
import {
  imageWorkKind,
  PLAYGROUND_TOOL_IDS,
  type PlaygroundToolId,
  WORK_BY_TOOL,
} from "./playgroundReset";

const TEXT: PlaygroundToolId = "playground-text-to-image";
const EDIT: PlaygroundToolId = "playground-image-to-image";
const UPSCALE: PlaygroundToolId = "playground-image-upscaling";
const OCR: PlaygroundToolId = "playground-ocr";
const AUDIO: PlaygroundToolId = "playground-audio";

describe("PLAYGROUND_TOOL_IDS", () => {
  it("lists the five tools, with the Audio tool once", () => {
    expect([...PLAYGROUND_TOOL_IDS]).toEqual([TEXT, EDIT, UPSCALE, OCR, AUDIO]);
  });
});

describe("WORK_BY_TOOL", () => {
  it("lists work for every tool", () => {
    for (const tool of PLAYGROUND_TOOL_IDS) {
      expect(WORK_BY_TOOL[tool].length).toBeGreaterThan(0);
    }
  });

  it("gives each tool its own parts, with no part shared", () => {
    const own = PLAYGROUND_TOOL_IDS.flatMap((tool) => WORK_BY_TOOL[tool]);
    expect(new Set(own).size).toBe(own.length);
  });

  it("gives the Audio tool its results and its input clips", () => {
    expect(WORK_BY_TOOL[AUDIO]).toEqual(["speechResults", "speechInputs"]);
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
