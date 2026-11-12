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
    // Intended change: the standalone UD marker names the quantization, so it is no longer in the stem.
    expect(parseGGUFFilename("Qwen3.6-35B-A3B-UD-IQ1_M.gguf")?.stem).toBe("qwen3.6-35b-a3b");
  });

  it("leaves a standalone UD marker out of the stem, so plain and UD files of one model match", () => {
    const plain = parseGGUFFilename("Qwen3.5-4B-Q4_K_M.gguf");
    const ud = parseGGUFFilename("Qwen3.5-4B-UD-Q4_K_XL.gguf");
    expect(ud?.stem).toBe("qwen3.5-4b");
    expect(ud?.stem).toBe(plain?.stem);
    expect(ud?.encoding).toBe("Q4_K_XL");
    expect(ud?.baseName).toBe("Qwen3.5");
    expect(ud?.sizeLabel).toBe("4B");
  });

  it("leaves a UD marker out of the stem for a UD-IQ quantization, in any case", () => {
    expect(parseGGUFFilename("gemma-4-E4B-it-UD-IQ2_M.gguf")?.stem).toBe("gemma-4-e4b-it");
    expect(parseGGUFFilename("gemma-4-E4B-it-ud-IQ1_S.gguf")?.stem).toBe("gemma-4-e4b-it");
    expect(parseGGUFFilename("gemma-4-E4B-it-UD-IQ1_S.gguf")?.encoding).toBe("IQ1_S");
  });

  it("keeps a UD-like token that is part of a word in the stem", () => {
    expect(parseGGUFFilename("Model-XUD-Q4_K_M.gguf")?.stem).toBe("model-xud");
  });

  it("gives a generic projector name the empty stem, even with a word left after the marker", () => {
    expect(parseGGUFFilename("mmproj-model-f16.gguf")?.stem).toBe("");
    expect(parseGGUFFilename("mmproj-vision-projector-F16.gguf")?.stem).toBe("");
    expect(parseGGUFFilename("mmproj-model-f16.gguf")?.sidecar).toBe("mmproj");
  });

  it("keeps a generic word that sits beside a model name in the stem", () => {
    expect(parseGGUFFilename("gemma-3-4b-it-Q4_K_M.gguf")?.stem).toBe("gemma-3-4b-it");
    expect(parseGGUFFilename("Model-7B-Q4_K_M.gguf")?.stem).toBe("model-7b");
    expect(parseGGUFFilename("Qwen-Model-Q4_K_M.gguf")?.stem).toBe("qwen-model");
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

  it("keeps an MTP token inside the model name as part of the name, so each file is a variant", () => {
    const groups = groupGGUFFiles([
      file("Tiel-Coder-35B-A3B-MTP-UD-IQ4_XS.gguf", 18_000_000_000),
      file("Tiel-Coder-35B-A3B-MTP-UD-Q2_K_XL.gguf", 12_000_000_000),
      file("mmproj-BF16.gguf", 902_000_000),
    ]);

    expect(groups.map((g) => g.main.precision)).toEqual(["Q2_K_XL", "IQ4_XS"]);
    for (const g of groups) {
      expect(g.sidecars.map((s) => s.filename)).toEqual(["mmproj-BF16.gguf"]);
    }
  });

  it("never lists a DFlash draft as a variant, nor attaches it to one", () => {
    const groups = groupGGUFFiles([
      file("gemma-4-26B-A4B-it-Q8_0.gguf", 26_000_000_000),
      file("dflash-gemma-4-26B-A4B-it-Q8_0.gguf", 470_000_000),
      file("mmproj-gemma-4-26B-A4B-it-Q8_0.gguf", 810_000_000),
    ]);

    expect(groups.map((g) => g.main.precision)).toEqual(["Q8_0"]);
    expect(groups[0].sidecars.map((s) => s.filename)).toEqual([
      "mmproj-gemma-4-26B-A4B-it-Q8_0.gguf",
    ]);
  });

  it("attaches a projector without a model name when the repo has one model, as in unsloth's E2B layout", () => {
    const groups = groupGGUFFiles([
      file("gemma-4-E2B-it-Q4_K_M.gguf", 3_100_000_000),
      file("gemma-4-E2B-it-Q8_0.gguf", 5_000_000_000),
      file("mmproj-BF16.gguf", 986_833_728),
      file("mmproj-F16.gguf", 985_654_080),
      file("mmproj-F32.gguf", 1_903_027_008),
    ]);

    expect(groups.map((g) => g.main.precision)).toEqual(["Q4_K_M", "Q8_0"]);
    // No quant matches a projector precision, so each variant gets F16, the preferred one.
    for (const g of groups) {
      expect(g.sidecars.map((s) => s.filename)).toEqual(["mmproj-F16.gguf"]);
    }
  });

  it("does not attach a projector without a model name when the repo has several models", () => {
    const groups = groupGGUFFiles([
      file("mmproj-F16.gguf", 900_000_000),
      file("Qwen3.6-35B-A3B-UD-IQ1_M.gguf", 10_000_000_000),
      file("Qwen3.6-4B-Q4_K_M.gguf", 2_000_000_000),
    ]);

    expect(groups.map((g) => g.main.precision)).toEqual(["Q4_K_M", "IQ1_M"]);
    expect(groups.every((g) => g.sidecars.length === 0)).toBe(true);
  });

  it("attaches a projector with the model name in the middle of the file name", () => {
    const groups = groupGGUFFiles([
      file("Model-7B-Q4_K_M.gguf", 4_000_000_000),
      file("Model-mmproj-7B-F16.gguf", 990_000_000),
    ]);

    expect(groups[0].sidecars.map((s) => s.filename)).toEqual(["Model-mmproj-7B-F16.gguf"]);
  });

  it("lists every quant of a model, each with one projector: the matching precision or the smallest", () => {
    const groups = groupGGUFFiles([
      file("Ternary-Bonsai-2-27B-F16.gguf", 53_000_000_000),
      file("Ternary-Bonsai-2-27B-PQ2_0.gguf", 7_200_000_000),
      file("Ternary-Bonsai-2-27B-PTQ1_0.gguf", 5_900_000_000),
      file("Ternary-Bonsai-2-27B-mmproj-BF16.gguf", 930_000_000),
      file("Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf", 630_000_000),
    ]);

    expect(groups.map((g) => g.main.precision)).toEqual(["PTQ1_0", "PQ2_0", "F16"]);
    // Intended change: no quant matches either projector, so each gets BF16 (preferred over the smaller Q8_0).
    for (const g of groups) {
      expect(g.sidecars.map((s) => s.filename)).toEqual(["Ternary-Bonsai-2-27B-mmproj-BF16.gguf"]);
    }
  });

  it("gives a variant the projector whose precision matches it", () => {
    const groups = groupGGUFFiles([
      file("SmolVLM-256M-Instruct-Q8_0.gguf", 175_000_000),
      file("SmolVLM-256M-Instruct-f16.gguf", 328_000_000),
      file("mmproj-SmolVLM-256M-Instruct-Q8_0.gguf", 104_000_000),
      file("mmproj-SmolVLM-256M-Instruct-f16.gguf", 190_000_000),
    ]);

    expect(groups.map((g) => g.main.precision)).toEqual(["Q8_0", "f16"]);
    expect(groups[0].sidecars.map((s) => s.filename)).toEqual([
      "mmproj-SmolVLM-256M-Instruct-Q8_0.gguf",
    ]);
    expect(groups[1].sidecars.map((s) => s.filename)).toEqual([
      "mmproj-SmolVLM-256M-Instruct-f16.gguf",
    ]);
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

  it("attaches the generic projector to both the plain and the UD variant of an Unsloth repo", () => {
    const groups = groupGGUFFiles([
      file("Qwen3.5-4B-Q4_K_M.gguf", 2_800_000_000),
      file("Qwen3.5-4B-UD-Q4_K_XL.gguf", 3_100_000_000),
      file("mmproj-BF16.gguf", 986_833_728),
      file("mmproj-F16.gguf", 985_654_080),
      file("mmproj-F32.gguf", 1_903_027_008),
    ]);

    expect(groups.map((g) => g.main.filename)).toEqual([
      "Qwen3.5-4B-Q4_K_M.gguf",
      "Qwen3.5-4B-UD-Q4_K_XL.gguf",
    ]);
    for (const g of groups) {
      expect(g.sidecars.map((s) => s.filename)).toEqual(["mmproj-F16.gguf"]);
    }
  });

  it("attaches a generic projector with a word left in its name, as in the gemma-3 repos", () => {
    const groups = groupGGUFFiles([
      file("gemma-3-4b-it-Q4_K_M.gguf", 2_500_000_000),
      file("mmproj-model-f16.gguf", 851_000_000),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].sidecars.map((s) => s.filename)).toEqual(["mmproj-model-f16.gguf"]);
  });

  it("gives a Q4_K_M variant the F16 projector when BF16, F16 and F32 are offered", () => {
    const groups = groupGGUFFiles([
      file("gemma-3-4b-it-Q4_K_M.gguf", 2_500_000_000),
      file("mmproj-BF16.gguf", 851_000_000),
      file("mmproj-F16.gguf", 851_000_000),
      file("mmproj-F32.gguf", 1_700_000_000),
    ]);

    expect(groups[0].sidecars.map((s) => s.filename)).toEqual(["mmproj-F16.gguf"]);
  });

  it("gives a BF16 variant the BF16 projector when several are offered", () => {
    const groups = groupGGUFFiles([
      file("gemma-3-4b-it-BF16.gguf", 8_000_000_000),
      file("mmproj-BF16.gguf", 851_000_000),
      file("mmproj-F16.gguf", 851_000_000),
      file("mmproj-F32.gguf", 1_700_000_000),
    ]);

    expect(groups[0].sidecars.map((s) => s.filename)).toEqual(["mmproj-BF16.gguf"]);
  });

  it("falls back to the smallest projector when neither F16 nor BF16 is offered", () => {
    const groups = groupGGUFFiles([
      file("gemma-3-4b-it-Q4_K_M.gguf", 2_500_000_000),
      file("mmproj-Q8_0.gguf", 600_000_000),
      file("mmproj-F32.gguf", 1_700_000_000),
    ]);

    expect(groups[0].sidecars.map((s) => s.filename)).toEqual(["mmproj-Q8_0.gguf"]);
  });
});
