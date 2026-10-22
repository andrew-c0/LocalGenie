import { describe, expect, it } from "vitest";
import { type GGUFFile, groupGGUFFiles } from "../services/hubModels";
import { isGGUF, parseGGUFFilename } from "./gguf";

describe("parseGGUFFilename", () => {
  it("reads the base name, size and quantization from a model file", () => {
    const parsed = parseGGUFFilename("Qwen3-4B-Q4_K_M.gguf");
    expect(parsed?.baseName).toBe("Qwen3");
    expect(parsed?.sizeLabel).toBe("4B");
    expect(parsed?.encoding).toBe("Q4_K_M");
    expect(parsed?.sidecar).toBeNull();
  });

  it("recognises a sidecar prefix", () => {
    const parsed = parseGGUFFilename("mmproj-Qwen3-4B-Q4_K_M.gguf");
    expect(parsed?.sidecar).toBe("mmproj");
    expect(parsed?.encoding).toBe("Q4_K_M");
  });

  it("returns null for names that are not GGUF files", () => {
    expect(parseGGUFFilename("README.md")).toBeNull();
    expect(isGGUF("README.md")).toBe(false);
    expect(isGGUF("Qwen3-4B-Q4_K_M.gguf")).toBe(true);
  });
});

describe("groupGGUFFiles", () => {
  const file = (filename: string, size: number): GGUFFile => {
    const parsed = parseGGUFFilename(filename);
    return {
      filename,
      precision: parsed?.encoding ?? "unknown",
      sizeLabel: parsed?.sizeLabel ?? null,
      version: parsed?.version ?? "v1.0",
      shard: parsed?.shard ?? null,
      size,
    };
  };

  it("orders variants by size and attaches a sidecar to the variant with the same encoding", () => {
    const groups = groupGGUFFiles([
      file("Qwen3-4B-Q8_0.gguf", 4_000_000_000),
      file("mmproj-Qwen3-4B-Q4_K_M.gguf", 100_000_000),
      file("Qwen3-4B-Q4_K_M.gguf", 2_000_000_000),
    ]);

    expect(groups.map((g) => g.main.filename)).toEqual([
      "Qwen3-4B-Q4_K_M.gguf",
      "Qwen3-4B-Q8_0.gguf",
    ]);
    expect(groups[0].sidecars.map((s) => s.filename)).toEqual(["mmproj-Qwen3-4B-Q4_K_M.gguf"]);
    expect(groups[1].sidecars).toHaveLength(0);
  });
});
