import { describe, expect, it } from "vitest";
import type { OcrModel } from "../types";
import {
  buildOcrRequest,
  DEFAULT_OCR_COMPUTE,
  defaultOcrMode,
  defaultOcrModel,
  effectiveOcrMode,
  ocrBlockedReason,
  ocrOversizedWarning,
  ocrResultOf,
  ocrSaveName,
} from "./ocr";

const model = (overrides: Partial<OcrModel> = {}): OcrModel => ({
  id: "m",
  name: "M",
  description: "",
  bestFor: "",
  license: "Apache-2.0",
  licenseUrl: "",
  sizeBytes: 1,
  downloaded: true,
  modes: [
    { id: "text", label: "Text" },
    { id: "table", label: "Table" },
  ],
  ...overrides,
});

const ready = { model: model(), inputPath: "a.png", serverRunning: true, jobRunning: false };

describe("ocr helpers", () => {
  it("picks the first downloaded model, else the first", () => {
    expect(defaultOcrModel([model({ id: "a", downloaded: false }), model({ id: "b" })])?.id).toBe(
      "b",
    );
    expect(defaultOcrModel([model({ id: "a", downloaded: false })])?.id).toBe("a");
    expect(defaultOcrModel([])).toBeNull();
  });

  it("falls back to the first mode when the chosen one is not offered", () => {
    const textOnly = model({ modes: [{ id: "text", label: "Text" }] });
    expect(defaultOcrMode(textOnly)).toBe("text");
    expect(effectiveOcrMode(textOnly, "table")).toBe("text");
    expect(effectiveOcrMode(model(), "table")).toBe("table");
  });

  it("warns only for a picture over 2500 px", () => {
    expect(ocrOversizedWarning(null)).toBeNull();
    expect(ocrOversizedWarning({ width: 2500, height: 100 })).toBeNull();
    expect(ocrOversizedWarning({ width: 100, height: 2501 })).toContain("2500 px");
  });

  it("builds the request with the compute settings and port", () => {
    expect(buildOcrRequest("j", model(), "a.png", "table", DEFAULT_OCR_COMPUTE, 8080)).toEqual({
      jobId: "j",
      modelId: "m",
      imagePath: "a.png",
      mode: "table",
      compute: "cpu",
      visionCompute: "npu",
      port: 8080,
    });
  });

  it("names the first thing that blocks a run", () => {
    expect(ocrBlockedReason(ready)).toBeNull();
    expect(ocrBlockedReason({ ...ready, jobRunning: true })).toMatch(/already/);
    expect(ocrBlockedReason({ ...ready, model: null })).toMatch(/Choose an OCR model/);
    expect(ocrBlockedReason({ ...ready, model: model({ downloaded: false }) })).toMatch(/Download/);
    expect(ocrBlockedReason({ ...ready, inputPath: null })).toMatch(/image/);
    expect(ocrBlockedReason({ ...ready, serverRunning: false })).toMatch(/server/);
  });

  it("builds the stored result from the event", () => {
    expect(ocrResultOf({ jobId: "j", status: "done", text: "hi", seconds: 3 }, "a.png")).toEqual({
      jobId: "j",
      status: "done",
      text: "hi",
      error: null,
      seconds: 3,
      inputName: "a.png",
    });
  });

  it("suggests a .txt name from the picture name", () => {
    expect(ocrSaveName("scan.page1.png")).toBe("scan.page1.txt");
    expect(ocrSaveName(null)).toBe("ocr-text.txt");
  });
});
