import { describe, expect, it } from "vitest";
import type { ToolSpec } from "../types";
import { chatToolGroups, chatToolRows, chatToolStateText, chatToolsLabel } from "./chatTools";

function spec(name: string): ToolSpec {
  return { id: name, name, description: "", parameters: {}, risk: "read", source: "native" };
}

const tools = [spec("list_directory"), spec("read_text_file"), spec("web_fetch")];

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

describe("chatToolGroups", () => {
  function mcpSpec(name: string, serverId: string, serverName: string): ToolSpec {
    return {
      id: name,
      name,
      description: "",
      parameters: {},
      risk: "external",
      source: "mcp",
      serverId,
      serverName,
    };
  }

  const mixed = [
    spec("list_directory"),
    mcpSpec("mcp__beta__ping", "beta", "Beta"),
    mcpSpec("mcp__alpha__one", "alpha", "Alpha"),
    mcpSpec("mcp__alpha__two", "alpha", "Alpha"),
  ];

  it("lists the built-in tools first, untitled, then one titled group per server", () => {
    const groups = chatToolGroups(mixed);
    expect(groups.map((group) => group.title)).toEqual([null, "Alpha", "Beta"]);
    expect(groups[0].tools.map((tool) => tool.name)).toEqual(["list_directory"]);
    expect(groups[1].tools.map((tool) => tool.name)).toEqual([
      "mcp__alpha__one",
      "mcp__alpha__two",
    ]);
  });

  it("gives no groups for no tools", () => {
    expect(chatToolGroups([])).toEqual([]);
  });

  it("keeps every listed MCP tool once grouped", () => {
    const rows = chatToolRows(mixed, {
      list_directory: "on",
      mcp__alpha__one: "on",
      mcp__alpha__two: "ask",
      mcp__beta__ping: "on",
    });
    const grouped = chatToolGroups(rows).flatMap((group) => group.tools);
    expect(grouped).toHaveLength(rows.length);
  });
});
