import { describe, expect, it } from "vitest";
import type { ImageResult, InputImage } from "../types";
import { resultForInput } from "./resultStage";

const picture = (path: string): InputImage => ({ path, name: "a.png", sourceSize: null });

const result = (inputPath: string | null): ImageResult => ({
  jobId: "job-1",
  kind: "generate",
  status: "done",
  path: "C:/out/a.png",
  error: null,
  seed: 1,
  seconds: 2,
  device: "cpu",
  inputPath,
});

describe("resultForInput", () => {
  it("shows the result made from the picture on the form", () => {
    const edit = result("C:/in/a.png");
    expect(resultForInput(edit, picture("C:/in/a.png"))).toBe(edit);
  });

  it("hides a result made from another picture", () => {
    expect(resultForInput(result("C:/in/a.png"), picture("C:/in/b.png"))).toBeNull();
  });

  it("hides a text to image result, which has no input picture", () => {
    expect(resultForInput(result(null), picture("C:/in/a.png"))).toBeNull();
  });

  it("shows nothing without a result or without a picture", () => {
    expect(resultForInput(null, picture("C:/in/a.png"))).toBeNull();
    expect(resultForInput(result("C:/in/a.png"), null)).toBeNull();
  });
});
