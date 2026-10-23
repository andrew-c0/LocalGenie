import { describe, expect, it } from "vitest";
import { shortModelKey } from "./modelKey";

describe("shortModelKey", () => {
  it("drops the org and the precision suffix from a server id", () => {
    expect(shortModelKey("unsloth/gemma-4-E4B-it-GGUF:Q4_K_M")).toBe("gemma-4-E4B-it-GGUF");
  });

  it("returns the last segment of a store name with no precision", () => {
    expect(shortModelKey("unsloth/gemma-4-E4B-it-GGUF")).toBe("gemma-4-E4B-it-GGUF");
  });

  it("returns the name unchanged when it has no org or precision", () => {
    expect(shortModelKey("gemma-4-E4B-it-GGUF")).toBe("gemma-4-E4B-it-GGUF");
  });

  it("matches a store name with its server id", () => {
    expect(shortModelKey("qualcomm/Qwen3-4B")).toBe(shortModelKey("org/Qwen3-4B:W4A16"));
  });

  it("returns an empty string for an empty name", () => {
    expect(shortModelKey("")).toBe("");
  });
});
