import { describe, expect, it } from "vitest";
import {
  approvalNote,
  approvalText,
  prettyArguments,
  TARGET_MAX_LENGTH,
  toolLabel,
  toolStatusText,
  toolTargetSummary,
  truncateText,
} from "./toolLines";

describe("toolLabel", () => {
  it("labels the built-in tools", () => {
    expect(toolLabel("list_directory")).toBe("Listed folder");
    expect(toolLabel("read_text_file")).toBe("Read file");
    expect(toolLabel("web_search")).toBe("Searched the web");
    expect(toolLabel("web_fetch")).toBe("Fetched page");
  });

  it("shows the raw name for a tool it does not know", () => {
    expect(toolLabel("make_coffee")).toBe("make_coffee");
  });
});

describe("toolTargetSummary", () => {
  it("prefers the path, then the query, then the url", () => {
    expect(toolTargetSummary('{"query":"q","path":"p.txt"}')).toBe("p.txt");
    expect(toolTargetSummary('{"url":"https://x.test","query":"q"}')).toBe("q");
    expect(toolTargetSummary('{"url":"https://x.test"}')).toBe("https://x.test");
  });

  it("trims the value and ignores blank or non-string values", () => {
    expect(toolTargetSummary('{"path":"  a.txt  "}')).toBe("a.txt");
    expect(toolTargetSummary('{"path":"   ","query":"q"}')).toBe("q");
    expect(toolTargetSummary('{"path":42}')).toBeNull();
  });

  it("returns null when the arguments name none of them, or are not an object", () => {
    expect(toolTargetSummary('{"limit":5}')).toBeNull();
    expect(toolTargetSummary("not json")).toBeNull();
    expect(toolTargetSummary("[]")).toBeNull();
  });

  it("truncates a long value with an ellipsis", () => {
    const long = "a".repeat(TARGET_MAX_LENGTH + 20);
    const summary = toolTargetSummary(JSON.stringify({ path: long }));
    expect(summary).toHaveLength(TARGET_MAX_LENGTH);
    expect(summary?.endsWith("…")).toBe(true);
  });
});

describe("truncateText", () => {
  it("leaves a short text as it is", () => {
    expect(truncateText("abc", 5)).toBe("abc");
  });

  it("cuts to the limit, counting the ellipsis", () => {
    expect(truncateText("abcdefgh", 5)).toBe("abcd…");
  });
});

describe("prettyArguments", () => {
  it("pretty-prints JSON", () => {
    expect(prettyArguments('{"path":"a","n":1}')).toBe('{\n  "path": "a",\n  "n": 1\n}');
  });

  it("shows text that is not JSON as it was sent", () => {
    expect(prettyArguments("{broken")).toBe("{broken");
  });
});

describe("toolStatusText", () => {
  it("shows the duration when a call ran", () => {
    expect(toolStatusText("ok", 1500)).toEqual({ text: "1.5s", warning: false });
    expect(toolStatusText("ok", 40)).toEqual({ text: "40ms", warning: false });
  });

  it("shows Done for a call that ran without a duration", () => {
    expect(toolStatusText("ok")).toEqual({ text: "Done", warning: false });
  });

  it("marks denied, failed and stopped calls as warnings", () => {
    expect(toolStatusText("error")).toEqual({ text: "Failed", warning: true });
    expect(toolStatusText("denied")).toEqual({ text: "Denied", warning: true });
    expect(toolStatusText("cancelled")).toEqual({ text: "Stopped", warning: true });
  });
});

describe("approvalText", () => {
  it("names each approval mode", () => {
    expect(approvalText("auto")).toBe("Automatic");
    expect(approvalText("once")).toBe("Approved once");
    expect(approvalText("chat")).toBe("Allowed for this chat");
  });
});

describe("web tool lines", () => {
  it("names the query of a web search and the url of a page fetch", () => {
    expect(
      toolTargetSummary('{"query":"rust borrow checker","source":"wikipedia","limit":3}'),
    ).toBe("rust borrow checker");
    expect(toolTargetSummary('{"url":"https://example.test/a","start":2000}')).toBe(
      "https://example.test/a",
    );
  });

  it("labels both web tools", () => {
    expect(toolLabel("web_search")).toBe("Searched the web");
    expect(toolLabel("web_fetch")).toBe("Fetched page");
  });
});

describe("approvalNote", () => {
  const wikipedia = {
    id: "wikipedia",
    label: "Wikipedia",
    host: "en.wikipedia.org",
    description: "Facts.",
  };
  const hackerNews = {
    id: "hacker_news",
    label: "Hacker News",
    host: "hn.algolia.com",
    description: "Tech.",
  };

  it("says a read tool reads files in the allowed folders", () => {
    expect(approvalNote("list_directory", "read", "{}", [])).toBe(
      "This tool can read files in the folders you allowed.",
    );
  });

  it("says a page fetch downloads the page from the internet", () => {
    expect(approvalNote("web_fetch", "network", '{"url":"https://x.test"}', [])).toBe(
      "This tool will download this page from the internet.",
    );
  });

  it("names the hosts of every turned-on source for a search that names none", () => {
    expect(approvalNote("web_search", "network", '{"query":"q"}', [wikipedia, hackerNews])).toBe(
      "This tool will send your search to: en.wikipedia.org, hn.algolia.com.",
    );
  });

  it("names only the chosen source's host when the search names a turned-on source", () => {
    expect(
      approvalNote("web_search", "network", '{"query":"q","source":"hacker_news"}', [
        wikipedia,
        hackerNews,
      ]),
    ).toBe("This tool will send your search to: hn.algolia.com.");
  });

  it("falls back to every turned-on source when the named one is not turned on", () => {
    expect(
      approvalNote("web_search", "network", '{"query":"q","source":"gone"}', [wikipedia]),
    ).toBe("This tool will send your search to: en.wikipedia.org.");
  });

  it("does not name a host when no source is turned on", () => {
    expect(approvalNote("web_search", "network", '{"query":"q"}', [])).toBe(
      "This tool will send your search to the sources you turned on.",
    );
  });

  it("adds nothing for a tool without a risk note", () => {
    expect(approvalNote("make_coffee", undefined, "{}", [])).toBeNull();
  });
});
