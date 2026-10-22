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

  it("reads UD, IQ and MXFP4 quantizations from Unsloth-style names", () => {
    expect(parseGGUFFilename("Qwen3.6-35B-A3B-UD-IQ1_M.gguf")?.encoding).toBe("IQ1_M");
    expect(parseGGUFFilename("Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf")?.encoding).toBe("Q4_K_XL");
    expect(parseGGUFFilename("Qwen3.6-35B-A3B-MXFP4_MOE.gguf")?.encoding).toBe("MXFP4_MOE");
    expect(parseGGUFFilename("Qwen3.6-35B-A3B-UD-IQ1_M.gguf")?.stem).toBe("qwen3.6-35b-a3b-ud");
  });

  it("reads a quantization that follows an underscored model name", () => {
    const parsed = parseGGUFFilename("gemma-4-E4B_q4_0-it.gguf");
    expect(parsed?.encoding).toBe("q4_0");
    expect(parsed?.stem).toBe("gemma-4-e4b-it");
  });

  it("recognises a sidecar marker at the end of the name", () => {
    const parsed = parseGGUFFilename("gemma-4-E4B-it-mmproj.gguf");
    expect(parsed?.sidecar).toBe("mmproj");
    expect(parsed?.encoding).toBeNull();
    expect(parsed?.stem).toBe("gemma-4-e4b-it");
  });
});

describe("groupGGUFFiles", () => {
  const file = (filename: string, size: number): GGUFFile => {
    const parsed = parseGGUFFilename(filename);
    return {
      filename,
      precision: parsed?.encoding ?? "unknown",
      sizeLabel: parsed?.sizeLabel ?? null,
      shard: parsed?.shard ?? null,
      size,
    };
  };

  it("attaches a suffix-style mmproj to the model it belongs to instead of listing it as a precision", () => {
    const groups = groupGGUFFiles([
      file("gemma-4-E4B-it-mmproj.gguf", 1_000_000_000),
      file("gemma-4-E4B_q4_0-it.gguf", 5_000_000_000),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].main.precision).toBe("q4_0");
    expect(groups[0].sidecars.map((s) => s.filename)).toEqual(["gemma-4-E4B-it-mmproj.gguf"]);
  });

  it("does not list an mmproj without a matching model as a variant", () => {
    const groups = groupGGUFFiles([
      file("mmproj-F16.gguf", 900_000_000),
      file("Qwen3.6-35B-A3B-UD-IQ1_M.gguf", 10_000_000_000),
    ]);

    expect(groups.map((g) => g.main.precision)).toEqual(["IQ1_M"]);
    expect(groups[0].sidecars).toHaveLength(0);
  });

  it("lists every quant of a model with the sidecars that belong to all of them", () => {
    const groups = groupGGUFFiles([
      file("Ternary-Bonsai-2-27B-F16.gguf", 53_000_000_000),
      file("Ternary-Bonsai-2-27B-PQ2_0.gguf", 7_200_000_000),
      file("Ternary-Bonsai-2-27B-PTQ1_0.gguf", 5_900_000_000),
      file("Ternary-Bonsai-2-27B-mmproj-BF16.gguf", 930_000_000),
      file("Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf", 630_000_000),
    ]);

    expect(groups.map((g) => g.main.precision)).toEqual(["PTQ1_0", "PQ2_0", "F16"]);
    for (const g of groups) {
      expect(g.sidecars.map((s) => s.filename)).toEqual([
        "Ternary-Bonsai-2-27B-mmproj-BF16.gguf",
        "Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf",
      ]);
    }
  });

  it("orders variants by size and attaches a sidecar to every variant of its model", () => {
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
    expect(groups[1].sidecars.map((s) => s.filename)).toEqual(["mmproj-Qwen3-4B-Q4_K_M.gguf"]);
  });
});
