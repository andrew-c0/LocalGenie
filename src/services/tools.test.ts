import { describe, expect, it } from "vitest";
import type { ToolResult } from "../types";
import { toToolResult } from "./tools";

const base: ToolResult = { ok: true, content: "done", truncated: false, durationMs: 4 };

describe("toToolResult", () => {
  it("keeps a complete image attachment", () => {
    const attachment = { path: "C:\\a.png", name: "a.png", mime: "image/png" };
    expect(toToolResult({ ...base, attachment })).toEqual({ ...base, attachment });
  });

  it("leaves the attachment off a result that has none", () => {
    expect(toToolResult(base)).toEqual(base);
    expect(toToolResult(base)).not.toHaveProperty("attachment");
  });

  it("drops an attachment without a path, since it cannot be read again", () => {
    const result = toToolResult({
      ...base,
      attachment: { path: "", name: "a.png", mime: "image/png" },
    });
    expect(result).toEqual(base);
  });

  it("drops an attachment with a missing field", () => {
    expect(toToolResult({ ...base, attachment: { path: "C:\\a.png", name: "a.png" } })).toEqual(
      base,
    );
  });
});
