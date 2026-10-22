import { describe, expect, it } from "vitest";
import type { SystemPromptBlock } from "../types";
import {
  blocksOf,
  composeSystemPrompt,
  estimateTokens,
  fileSection,
  formatSize,
  type PlatformSnapshot,
  platformLine,
  withSystemBlocks,
} from "./systemPrompt";

const NOW = new Date(Date.UTC(2026, 9, 22, 14, 5, 9));

const PLATFORM: PlatformSnapshot = {
  os: "Windows",
  osVersion: "Windows 11 Pro",
  arch: "aarch64",
  totalMemoryBytes: 32 * 1024 ** 3,
  chipset: "Snapdragon X Elite",
};

/** Reads succeed for known paths and fail for everything else. */
const files: Record<string, string> = { "C:/notes/persona.md": "  Be terse.  " };
const readFile = async (path: string) => {
  if (path in files) return files[path];
  throw new Error("not found");
};

function compose(blocks: SystemPromptBlock[], platform: PlatformSnapshot | null = PLATFORM) {
  return composeSystemPrompt(blocks, { now: NOW, timeZone: "UTC", platform, readFile });
}

describe("composeSystemPrompt", () => {
  it("joins blocks in order with a blank line", async () => {
    const result = await compose([
      { id: "1", kind: "text", text: "You are helpful." },
      { id: "2", kind: "text", text: "Answer in French." },
    ]);
    expect(result.prompt).toBe("You are helpful.\n\nAnswer in French.");
    expect(result.skipped).toEqual([]);
  });

  it("skips empty and whitespace-only text blocks", async () => {
    const result = await compose([
      { id: "1", kind: "text", text: "   " },
      { id: "2", kind: "text", text: "Keep this." },
      { id: "3", kind: "text", text: "" },
    ]);
    expect(result.prompt).toBe("Keep this.");
  });

  it("resolves the date block from the given time and zone", async () => {
    const result = await compose([{ id: "1", kind: "datetime" }]);
    expect(result.prompt).toContain("22 October 2026");
    expect(result.prompt).toContain("14:05:09");
    expect(result.prompt).toContain("(UTC)");
  });

  it("resolves the platform block, including the chipset", async () => {
    const result = await compose([{ id: "1", kind: "platform" }]);
    expect(result.prompt).toBe(
      "Platform: Windows 11 Pro, aarch64, 32 GB RAM, chipset Snapdragon X Elite.",
    );
  });

  it("wraps file contents in delimiters and reads them on every send", async () => {
    const result = await compose([
      { id: "1", kind: "file", path: "C:/notes/persona.md", name: "persona.md" },
    ]);
    expect(result.prompt).toBe("--- file: persona.md ---\nBe terse.\n--- end of file ---");
  });

  it("skips a file that cannot be read and reports its name", async () => {
    const result = await compose([
      { id: "1", kind: "text", text: "Base." },
      { id: "2", kind: "file", path: "C:/gone.txt", name: "gone.txt" },
    ]);
    expect(result.prompt).toBe("Base.");
    expect(result.skipped).toEqual(["gone.txt"]);
  });
});

describe("platformLine", () => {
  it("omits the chipset when it is unknown", () => {
    expect(platformLine({ ...PLATFORM, chipset: "unknown" })).toBe(
      "Platform: Windows 11 Pro, aarch64, 32 GB RAM.",
    );
  });

  it("omits the chipset when the probe returned nothing", () => {
    expect(platformLine({ ...PLATFORM, chipset: null })).not.toContain("chipset");
  });

  it("returns null when platform info is not available", () => {
    expect(platformLine(null)).toBeNull();
  });
});

describe("legacy system prompt", () => {
  it("turns a saved single-text prompt into one text block", () => {
    expect(blocksOf({ systemPrompt: "Be brief." })).toEqual([
      { id: "legacy-text", kind: "text", text: "Be brief." },
    ]);
  });

  it("returns no blocks for an empty legacy prompt", () => {
    expect(blocksOf({ systemPrompt: "   " })).toEqual([]);
  });

  it("prefers saved blocks over the legacy field", () => {
    const blocks: SystemPromptBlock[] = [{ id: "a", kind: "datetime" }];
    expect(blocksOf({ systemPrompt: "old", systemBlocks: blocks })).toEqual(blocks);
  });

  it("drops the legacy field when settings are migrated", () => {
    const migrated = withSystemBlocks({ systemPrompt: "Be brief.", temperature: 0.2 });
    expect(migrated).not.toHaveProperty("systemPrompt");
    expect(migrated.temperature).toBe(0.2);
    expect(migrated.systemBlocks).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("estimates about four characters per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("formats file sizes", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1.5 KB");
  });

  it("builds the file section", () => {
    expect(fileSection("a.md", "x\n")).toBe("--- file: a.md ---\nx\n--- end of file ---");
  });
});
