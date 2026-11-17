import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolResult } from "../types";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { executeTool, toToolResult } from "./tools";

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

describe("executeTool", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(base);
  });

  it("sends no result budget when none is given, so the backend default applies", async () => {
    await executeTool("web_fetch", "{}", ["C:/notes"], null);
    const payload = invokeMock.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toEqual({
      name: "web_fetch",
      arguments: "{}",
      allowedFolders: ["C:/notes"],
      enabledSearchSources: null,
    });
    expect(payload).not.toHaveProperty("resultMaxChars");
  });

  it("sends the budget as resultMaxChars when one is given", async () => {
    await executeTool("web_fetch", "{}", [], null, 4301);
    expect(invokeMock).toHaveBeenCalledWith("tool_execute", {
      name: "web_fetch",
      arguments: "{}",
      allowedFolders: [],
      enabledSearchSources: null,
      resultMaxChars: 4301,
    });
  });
});
