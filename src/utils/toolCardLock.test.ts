import { describe, expect, it } from "vitest";
import type { SearchSourceInfo, ToolSpec } from "../types";
import { toolCardLock } from "./toolCardLock";

const wikipedia: SearchSourceInfo = {
  id: "wikipedia",
  label: "Wikipedia",
  host: "en.wikipedia.org",
  description: "Encyclopedia facts.",
};
const sources = [wikipedia];

const webSearch: ToolSpec = {
  id: "web_search",
  name: "web_search",
  description: "Search public sources. Not a general web search.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      source: { type: "string", enum: ["wikipedia"], description: "Which source to search." },
    },
  },
  risk: "network",
  source: "native",
};

const readImage: ToolSpec = {
  id: "read_image",
  name: "read_image",
  description: "Reads an image.",
  parameters: { type: "object", properties: {} },
  risk: "read",
  source: "native",
};

describe("toolCardLock", () => {
  it("locks web_search when no search source is turned on", () => {
    const lock = toolCardLock(webSearch, [], sources);
    expect(lock.locked).toBe(true);
    expect(lock.note).toBe("Turn on at least one search source below to use web search.");
  });

  it("locks web_search when the only saved id is no longer offered", () => {
    expect(toolCardLock(webSearch, ["gone"], sources).locked).toBe(true);
  });

  it("locks web_search when the backend offers no sources", () => {
    expect(toolCardLock(webSearch, ["wikipedia"], []).locked).toBe(true);
  });

  it("does not lock web_search once one source is turned on", () => {
    expect(toolCardLock(webSearch, ["wikipedia"], sources)).toEqual({ locked: false, note: null });
  });

  it("never locks another tool, whatever the search sources", () => {
    expect(toolCardLock(readImage, [], [])).toEqual({ locked: false, note: null });
    expect(toolCardLock(readImage, [], sources)).toEqual({ locked: false, note: null });
  });
});
