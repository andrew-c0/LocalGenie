import { describe, expect, it } from "vitest";
import { FAMILY_ALL, familyFilterOptions, matchesFamily, modelFamilyOf } from "./modelFamily";

describe("modelFamilyOf", () => {
  it("reads the family from the repo name, ignoring the org and precision", () => {
    expect(modelFamilyOf("qualcomm/Qwen3-4B-Instruct-2507:W4A16")).toBe("qwen");
    expect(modelFamilyOf("unsloth/gemma-4-E4B-it-GGUF")).toBe("gemma");
    expect(modelFamilyOf("org/Llama-3.2-1B")).toBe("llama");
  });

  it("prefers the more specific family for distilled models", () => {
    expect(modelFamilyOf("deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B")).toBe("deepseek");
  });

  it("matches Phi only as a whole token", () => {
    expect(modelFamilyOf("microsoft/Phi-4-mini")).toBe("phi");
    expect(modelFamilyOf("org/Sophia-7B")).toBe("other");
  });

  it("falls back to other for unknown names", () => {
    expect(modelFamilyOf("org/SomeNewModel-7B")).toBe("other");
  });
});

describe("familyFilterOptions", () => {
  it("lists only the families present, after All", () => {
    expect(familyFilterOptions(["a/Qwen3-4B", "a/gemma-2B", "a/Qwen2-7B"])).toEqual([
      [FAMILY_ALL, "All"],
      ["qwen", "Qwen"],
      ["gemma", "Gemma"],
    ]);
  });

  it("adds Other when some model matches no family", () => {
    expect(familyFilterOptions(["a/Qwen3-4B", "a/Mystery-1B"])).toEqual([
      [FAMILY_ALL, "All"],
      ["qwen", "Qwen"],
      ["other", "Other"],
    ]);
  });
});

describe("matchesFamily", () => {
  it("passes every model for All", () => {
    expect(matchesFamily("a/Mystery-1B", FAMILY_ALL)).toBe(true);
  });

  it("passes only models of the selected family", () => {
    expect(matchesFamily("a/Qwen3-4B", "qwen")).toBe(true);
    expect(matchesFamily("a/gemma-2B", "qwen")).toBe(false);
  });
});
