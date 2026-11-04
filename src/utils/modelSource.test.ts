import { describe, expect, it } from "vitest";
import { sourceLabel } from "./modelSource";

describe("sourceLabel", () => {
  it("spells out the stored source codes", () => {
    expect(sourceLabel("hf")).toBe("Hugging Face");
    expect(sourceLabel("aihub")).toBe("Qualcomm AI Hub");
    expect(sourceLabel("docker")).toBe("Docker");
    expect(sourceLabel("localfs")).toBe("Local files");
  });

  it("returns an unknown code unchanged", () => {
    expect(sourceLabel("other")).toBe("other");
  });
});
