import { describe, expect, it } from "vitest";
import type { SearchSourceInfo, ToolSpec } from "../types";
import {
  activeSourceIds,
  enabledSources,
  parseSourceIds,
  serializeSourceIds,
  toggleSource,
  WEB_SEARCH_SOURCES_KEY,
  withEnabledSources,
} from "./webSearchSources";

const wikipedia: SearchSourceInfo = {
  id: "wikipedia",
  label: "Wikipedia",
  host: "en.wikipedia.org",
  description: "Encyclopedia facts.",
};
const hackerNews: SearchSourceInfo = {
  id: "hacker_news",
  label: "Hacker News",
  host: "hn.algolia.com",
  description: "Tech discussions.",
};
const sources = [wikipedia, hackerNews];

const webSearch: ToolSpec = {
  id: "web_search",
  name: "web_search",
  description: "Search public sources. Not a general web search.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string" },
      source: {
        type: "string",
        enum: ["wikipedia", "hacker_news"],
        description: "Which source to search.",
      },
      limit: { type: "integer" },
    },
    required: ["query"],
  },
  risk: "network",
  source: "native",
};

const webFetch: ToolSpec = {
  id: "web_fetch",
  name: "web_fetch",
  description: "Fetch a page.",
  parameters: { type: "object", properties: { url: { type: "string" } } },
  risk: "network",
  source: "native",
};

describe("WEB_SEARCH_SOURCES_KEY", () => {
  it("is the preference name the sources are saved under", () => {
    expect(WEB_SEARCH_SOURCES_KEY).toBe("web_search_sources");
  });
});

describe("parseSourceIds", () => {
  it("reads the stored JSON text", () => {
    expect(parseSourceIds('["wikipedia","hacker_news"]')).toEqual(["wikipedia", "hacker_news"]);
  });

  it("accepts an already parsed array", () => {
    expect(parseSourceIds(["wikipedia"])).toEqual(["wikipedia"]);
  });

  it("reads nothing, a missing value or a non-list as no sources", () => {
    expect(parseSourceIds(null)).toEqual([]);
    expect(parseSourceIds(undefined)).toEqual([]);
    expect(parseSourceIds("not json")).toEqual([]);
    expect(parseSourceIds('{"wikipedia":true}')).toEqual([]);
    expect(parseSourceIds("wikipedia")).toEqual([]);
  });

  it("drops non-string and blank entries and removes duplicates", () => {
    expect(parseSourceIds(["wikipedia", 3, null, "  ", "wikipedia", " hacker_news "])).toEqual([
      "wikipedia",
      "hacker_news",
    ]);
  });
});

describe("serializeSourceIds", () => {
  it("writes the list as JSON text, and reads it back", () => {
    const text = serializeSourceIds(["wikipedia", "hacker_news"]);
    expect(text).toBe('["wikipedia","hacker_news"]');
    expect(parseSourceIds(text)).toEqual(["wikipedia", "hacker_news"]);
  });

  it("writes an empty list as an empty array", () => {
    expect(serializeSourceIds([])).toBe("[]");
  });
});

describe("toggleSource", () => {
  it("adds an id when turned on", () => {
    expect(toggleSource(["wikipedia"], "hacker_news", true)).toEqual(["wikipedia", "hacker_news"]);
  });

  it("removes an id when turned off", () => {
    expect(toggleSource(["wikipedia", "hacker_news"], "wikipedia", false)).toEqual(["hacker_news"]);
  });

  it("returns the same array when the id is already in that state", () => {
    const list = ["wikipedia"];
    expect(toggleSource(list, "wikipedia", true)).toBe(list);
    expect(toggleSource(list, "hacker_news", false)).toBe(list);
  });

  it("does not change the list it is given", () => {
    const list = ["wikipedia"];
    toggleSource(list, "hacker_news", true);
    expect(list).toEqual(["wikipedia"]);
  });
});

describe("enabledSources and activeSourceIds", () => {
  it("keeps the source list's order, not the saved order", () => {
    expect(enabledSources(["hacker_news", "wikipedia"], sources)).toEqual([wikipedia, hackerNews]);
  });

  it("ignores saved ids the backend no longer offers", () => {
    expect(activeSourceIds(["gone", "hacker_news"], sources)).toEqual(["hacker_news"]);
  });

  it("is empty when nothing is turned on", () => {
    expect(activeSourceIds([], sources)).toEqual([]);
  });
});

describe("withEnabledSources", () => {
  it("narrows the source enum to the turned-on sources", () => {
    const offered = withEnabledSources(webSearch, ["hacker_news"], sources);
    expect(offered?.parameters).toMatchObject({
      properties: { source: { enum: ["hacker_news"] } },
    });
  });

  it("adds the ids and descriptions of the enabled sources to the source description", () => {
    const offered = withEnabledSources(webSearch, ["wikipedia", "hacker_news"], sources);
    const properties = offered?.parameters.properties;
    expect(properties).toMatchObject({
      source: {
        description:
          "Which source to search. Enabled sources: wikipedia: Encyclopedia facts.; hacker_news: Tech discussions.",
      },
    });
  });

  it("keeps the other schema parts and the rest of the spec as they were", () => {
    const offered = withEnabledSources(webSearch, ["wikipedia"], sources);
    expect(offered).toMatchObject({
      name: "web_search",
      risk: "network",
      parameters: { type: "object", required: ["query"] },
    });
    expect(offered?.parameters.properties).toMatchObject({
      query: { type: "string" },
      limit: { type: "integer" },
    });
  });

  it("returns null, so the tool is not offered, when no source is turned on", () => {
    expect(withEnabledSources(webSearch, [], sources)).toBeNull();
  });

  it("returns null when only sources the backend no longer offers are saved", () => {
    expect(withEnabledSources(webSearch, ["gone"], sources)).toBeNull();
  });

  it("does not change the spec it is given", () => {
    withEnabledSources(webSearch, ["wikipedia"], sources);
    expect(webSearch.parameters.properties).toMatchObject({
      source: { enum: ["wikipedia", "hacker_news"], description: "Which source to search." },
    });
  });

  it("returns any other tool unchanged, even with no source on", () => {
    expect(withEnabledSources(webFetch, [], sources)).toBe(webFetch);
  });
});
