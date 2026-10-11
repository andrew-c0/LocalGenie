/**
 * Unit tests for the GGUF filename parser.
 *
 * Tests the `parseGGUFFilename` and `isGGUF` functions which parse a GGUF
 * filename according to the naming convention defined in
 * `memories/external/gguf/gguf.md`.
 *
 *   `[<Sidecar>]<BaseName><SizeLabel><FineTune><Version><Encoding><Type><Shard>.gguf`
 *
 * At minimum the regex requires BaseName, SizeLabel, and Version to be present
 * in that order. If any required component is missing the filename does not
 * match and `parseGGUFFilename` returns `null`.
 *
 * NOTE: this project does not currently declare a test runner in
 * `package.json`. The tests below use the Jest/Vitest globals
 * (`describe`, `it`, `expect`). Add `vitest` (or `jest`) as a devDependency
 * and wire up the corresponding script to run them.
 */
import { parseGGUFFilename, isGGUF, type GGUFParseResult } from "./gguf";

describe("parseGGUFFilename", () => {
  describe("the user-provided example — Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf", () => {
    // This filename omits the required Version component (there is no `vX.Y`
    // segment). Even though `mmproj` looks like the sidecar prefix, it is NOT at
    // the start of the filename so it is treated as part of the BaseName/FineTune
    // instead. Without a Version the regex cannot match, so the function returns
    // `null` — exactly as the documentation states filenames should at minimum
    // contain BaseName, SizeLabel and Version.
    it("returns null because the required version token is missing", () => {
      const result =
        parseGGUFFilename("Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf");

      // `null` proves the filename does not match the naming convention.
      expect(result).toBeNull();
    });
  });

  describe("valid filenames", () => {
    it("parses the documentation example: Mixtral-8x7B-v0.1-KQ2.gguf", () => {
      const result = parseGGUFFilename("Mixtral-8x7B-v0.1-KQ2.gguf");

      expect(result).not.toBeNull();
      if (result) {
        expect(result.sidecar).toBeNull();
        expect(result.baseName).toBe("Mixtral");
        expect(result.sizeLabel).toBe("8x7B");
        expect(result.fineTune).toBeNull();
        expect(result.version).toBe("v0.1");
        expect(result.encoding).toBe("KQ2");
        expect(result.type).toBeNull();
        expect(result.shard).toBeNull();
      }
    });

    it("parses mmproj filename with encoding", () => {
      const result = parseGGUFFilename("mmproj-Qwen2-VL-7B-v1.0-F16.gguf");

      expect(result).not.toBeNull();
      if (result) {
        expect(result.sidecar).toBe("mmproj");
        expect(result.baseName).toBe("Qwen2-VL");
        expect(result.sizeLabel).toBe("7B");
        expect(result.fineTune).toBeNull();
        expect(result.version).toBe("v1.0");
        expect(result.encoding).toBe("F16");
        expect(result.type).toBeNull();
        expect(result.shard).toBeNull();
      }
    });

    it("parses filename with fine-tune", () => {
      const result = parseGGUFFilename("Phi-3-mini-3.8B-ContextLength4k-instruct-v1.0.gguf");

      expect(result).not.toBeNull();
      if (result) {
        expect(result.sidecar).toBeNull();
        expect(result.baseName).toBe("Phi-3-mini");
        expect(result.sizeLabel).toBe("3.8B-ContextLength4k");
        expect(result.fineTune).toBe("instruct");
        expect(result.version).toBe("v1.0");
        expect(result.encoding).toBeNull();
        expect(result.type).toBeNull();
        expect(result.shard).toBeNull();
      }
    });

    it("parses filename with shard", () => {
      const result = parseGGUFFilename("Grok-100B-v1.0-Q4_0-00003-of-00009.gguf");

      expect(result).not.toBeNull();
      if (result) {
        expect(result.sidecar).toBeNull();
        expect(result.baseName).toBe("Grok");
        expect(result.sizeLabel).toBe("100B");
        expect(result.fineTune).toBeNull();
        expect(result.version).toBe("v1.0");
        expect(result.encoding).toBe("Q4_0");
        expect(result.type).toBeNull();
        expect(result.shard).toBe("00003-of-00009");
      }
    });

    it("parses filename with LoRA type", () => {
      const result = parseGGUFFilename("test-model-7B-v1.0-Q4_0-LoRA.gguf");
      expect(result).not.toBeNull();
      if (result) {
        expect(result.sidecar).toBeNull();
        expect(result.baseName).toBe("test-model");
        expect(result.sizeLabel).toBe("7B");
        expect(result.fineTune).toBeNull();
        expect(result.version).toBe("v1.0");
        expect(result.encoding).toBe("Q4_0");
        expect(result.type).toBe("LoRA");
        expect(result.shard).toBeNull();
      }
    });
  });

  describe("invalid filenames", () => {
    it("returns null for filename with wrong extension", () => {
      const result = parseGGUFFilename("model.pt");
      expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
      const result = parseGGUFFilename("");
      expect(result).toBeNull();
    });

    it("returns null for filename missing version (user's example)", () => {
      const result = parseGGUFFilename("Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf");
      expect(result).toBeNull();
    });

    it("returns null for Qwen3-0.6B-Q8_0.gguf (missing version)", () => {
      const result = parseGGUFFilename("Qwen3-0.6B-Q8_0.gguf");
      expect(result).toBeNull();
    });

    it("returns null for completely invalid filename", () => {
      const result = parseGGUFFilename("not-a-gguf-file-at-all.txt");
      expect(result).toBeNull();
    });
  });
});

describe("isGGUF", () => {
  it("returns true for valid GGUF filenames", () => {
    expect(isGGUF("Mixtral-8x7B-v0.1-KQ2.gguf")).toBe(true);
    expect(isGGUF("mmproj-Qwen2-VL-7B-v1.0-F16.gguf")).toBe(true);
    expect(isGGUF("Grok-100B-v1.0-Q4_0-00003-of-00009.gguf")).toBe(true);
  });

  it("returns false for invalid filenames", () => {
    expect(isGGUF("Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf")).toBe(false); // Missing version
    expect(isGGUF("Qwen3-0.6B-Q8_0.gguf")).toBe(false); // Missing version
    expect(isGGUF("random.txt")).toBe(false);
    expect(isGGUF("model.pt")).toBe(false);
    expect(isGGUF("")).toBe(false);
  });
});
