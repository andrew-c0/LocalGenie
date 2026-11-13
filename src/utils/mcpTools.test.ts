import { describe, expect, it } from "vitest";
import type { ToolSpec } from "../types";
import { groupToolsBySource, mcpDisplayName, parseMcpToolName } from "./mcpTools";
import { toolLabel } from "./toolLines";

function native(name: string): ToolSpec {
  return { id: name, name, description: "", parameters: {}, risk: "read", source: "native" };
}

function mcp(name: string, serverId: string, serverName: string): ToolSpec {
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

describe("parseMcpToolName", () => {
  it("splits the server slug from the tool's own name", () => {
    expect(parseMcpToolName("mcp__files__read_file")).toEqual({
      serverSlug: "files",
      toolName: "read_file",
    });
  });

  it("keeps single underscores and dashes inside the tool name", () => {
    expect(parseMcpToolName("mcp__my-files__list_all-items")).toEqual({
      serverSlug: "my-files",
      toolName: "list_all-items",
    });
  });

  it("returns null for a name that is not an MCP tool name", () => {
    expect(parseMcpToolName("read_text_file")).toBeNull();
    expect(parseMcpToolName("mcp_files__read")).toBeNull();
  });

  it("returns null when the slug or the tool name is empty", () => {
    expect(parseMcpToolName("mcp____read")).toBeNull();
    expect(parseMcpToolName("mcp__files__")).toBeNull();
    expect(parseMcpToolName("mcp__files")).toBeNull();
  });
});

describe("mcpDisplayName", () => {
  it("reads as the server name, a dot and the original tool name", () => {
    expect(mcpDisplayName("mcp__files__read_file", "Local files")).toBe("Local files · read_file");
  });

  it("falls back to the slug when the server name is not known", () => {
    expect(mcpDisplayName("mcp__files__read_file")).toBe("files · read_file");
    expect(mcpDisplayName("mcp__files__read_file", "")).toBe("files · read_file");
  });

  it("returns null for a name that is not an MCP tool name", () => {
    expect(mcpDisplayName("list_directory", "Local files")).toBeNull();
  });
});

describe("toolLabel for MCP tools", () => {
  it("shows the server and the tool, and keeps the built-in labels", () => {
    expect(toolLabel("mcp__files__read_file", "Local files")).toBe("Local files · read_file");
    expect(toolLabel("mcp__files__read_file")).toBe("files · read_file");
    expect(toolLabel("list_directory", "Local files")).toBe("Listed folder");
  });
});

describe("groupToolsBySource", () => {
  it("keeps the built-in tools apart from the MCP tools", () => {
    const groups = groupToolsBySource([
      native("list_directory"),
      mcp("mcp__a__one", "a", "Alpha"),
      native("web_fetch"),
    ]);
    expect(groups.native.map((tool) => tool.name)).toEqual(["list_directory", "web_fetch"]);
    expect(groups.servers.map((group) => group.serverName)).toEqual(["Alpha"]);
  });

  it("groups the tools of one server together, in registry order", () => {
    const groups = groupToolsBySource([
      mcp("mcp__b__x", "b", "Beta"),
      mcp("mcp__a__one", "a", "Alpha"),
      mcp("mcp__a__two", "a", "Alpha"),
    ]);
    expect(groups.servers).toEqual([
      {
        serverId: "a",
        serverName: "Alpha",
        tools: [mcp("mcp__a__one", "a", "Alpha"), mcp("mcp__a__two", "a", "Alpha")],
      },
      { serverId: "b", serverName: "Beta", tools: [mcp("mcp__b__x", "b", "Beta")] },
    ]);
  });

  it("sorts the server groups by name without case", () => {
    const groups = groupToolsBySource([
      mcp("mcp__z__a", "z", "zeta"),
      mcp("mcp__b__a", "b", "Alpha"),
    ]);
    expect(groups.servers.map((group) => group.serverName)).toEqual(["Alpha", "zeta"]);
  });

  it("names a group whose tool has no server name", () => {
    const tool: ToolSpec = { ...mcp("mcp__c__a", "c", ""), serverName: undefined };
    const groups = groupToolsBySource([tool]);
    expect(groups.servers[0].serverName).toBe("MCP server");
  });

  it("returns empty lists for no tools", () => {
    expect(groupToolsBySource([])).toEqual({ native: [], servers: [] });
  });
});
