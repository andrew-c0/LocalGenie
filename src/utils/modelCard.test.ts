import { describe, expect, it } from "vitest";
import { stripFrontMatter } from "./modelCard";

describe("stripFrontMatter", () => {
  it("removes a leading YAML block and keeps the markdown after it", () => {
    expect(stripFrontMatter("---\nlicense: mit\ntags:\n  - gguf\n---\n# Title\nBody")).toBe(
      "# Title\nBody",
    );
  });

  it("returns text with no front matter as it is", () => {
    const text = "# Title\n\nBody";
    expect(stripFrontMatter(text)).toBe(text);
  });

  it("handles CRLF line endings", () => {
    expect(stripFrontMatter("---\r\nlicense: mit\r\n---\r\nBody")).toBe("Body");
  });

  it("handles an empty front matter block", () => {
    expect(stripFrontMatter("---\n---\nBody")).toBe("Body");
  });

  it("skips a byte order mark before the opening line", () => {
    expect(stripFrontMatter("﻿---\nlicense: mit\n---\nBody")).toBe("Body");
  });

  it("keeps the text when the block never closes", () => {
    const text = "---\nlicense: mit\n# Title";
    expect(stripFrontMatter(text)).toBe(text);
  });

  it("keeps a horizontal rule that is not at the start", () => {
    const text = "# Title\n---\nMore";
    expect(stripFrontMatter(text)).toBe(text);
  });

  it("does not take a line that only starts with dashes for the block", () => {
    const text = "--- not a block\n---\nBody";
    expect(stripFrontMatter(text)).toBe(text);
  });
});
