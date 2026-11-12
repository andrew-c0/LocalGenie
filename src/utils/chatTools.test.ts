import { describe, expect, it } from "vitest";
import type { SearchSourceInfo, ToolSpec } from "../types";
import { activeChatToolCount, chatToolRows, chatToolStateText, chatToolsLabel } from "./chatTools";

function spec(name: string): ToolSpec {
  return { id: name, name, description: "", parameters: {}, risk: "read", source: "native" };
}

const tools = [spec("list_directory"), spec("read_text_file"), spec("web_fetch")];

const wikipedia: SearchSourceInfo = {
  id: "wikipedia",
  label: "Wikipedia",
  host: "en.wikipedia.org",
  description: "Facts.",
};
const sources = [wikipedia];

describe("chatToolRows", () => {
  it("lists the tools whose global state is not off, in registry order", () => {
    const rows = chatToolRows(tools, {
      web_fetch: "ask",
      list_directory: "on",
      read_text_file: "off",
    });
    expect(rows.map((tool) => tool.name)).toEqual(["list_directory", "web_fetch"]);
  });

  it("treats a tool missing from the states as off", () => {
    expect(chatToolRows(tools, {})).toEqual([]);
  });
});

describe("activeChatToolCount", () => {
  const rows = chatToolRows(tools, {
    list_directory: "on",
    read_text_file: "ask",
    web_fetch: "on",
  });

  it("counts every listed tool when none is switched off for the chat", () => {
    expect(activeChatToolCount(rows, [], [], sources)).toBe(3);
  });

  it("leaves out the tools switched off for the chat", () => {
    expect(activeChatToolCount(rows, ["read_text_file"], [], sources)).toBe(2);
  });

  it("ignores a switched-off name that is not listed", () => {
    expect(activeChatToolCount(rows, ["not_a_tool"], [], sources)).toBe(3);
  });

  it("does not count web_search when no search source is on", () => {
    const withSearch = chatToolRows([...tools, spec("web_search")], {
      list_directory: "on",
      web_search: "on",
    });
    expect(activeChatToolCount(withSearch, [], [], sources)).toBe(1);
  });

  it("counts web_search once a search source is on", () => {
    const withSearch = chatToolRows([...tools, spec("web_search")], {
      list_directory: "on",
      web_search: "on",
    });
    expect(activeChatToolCount(withSearch, [], ["wikipedia"], sources)).toBe(2);
  });

  it("does not count web_search when the only saved source is one the backend no longer offers", () => {
    const withSearch = chatToolRows([spec("web_search")], { web_search: "on" });
    expect(activeChatToolCount(withSearch, [], ["gone"], sources)).toBe(0);
  });
});

describe("chatToolStateText", () => {
  it("shows the global state in the words the popover uses", () => {
    expect(chatToolStateText("ask", true)).toBe("Asks first");
    expect(chatToolStateText("on", true)).toBe("On");
  });

  it("says no search source is on for a tool that cannot be offered", () => {
    expect(chatToolStateText("on", false)).toBe("No search source on");
    expect(chatToolStateText("ask", false)).toBe("No search source on");
  });
});

describe("chatToolsLabel", () => {
  it("names the count of active tools for screen readers", () => {
    expect(chatToolsLabel(3)).toBe("Tools for this chat, 3 active");
    expect(chatToolsLabel(0)).toBe("Tools for this chat, 0 active");
  });
});
