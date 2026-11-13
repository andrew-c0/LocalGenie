import type { ToolSpec } from "../types";

/**
 * Pure rules for MCP tools: how a namespaced tool name reads, and how the tool list splits into the
 * built-in tools and one group per server. No state and no I/O here.
 */

/** Every MCP tool's name starts with this prefix, then the server slug. */
export const MCP_TOOL_PREFIX = "mcp__";

/** Separates the server slug from the tool's own name in `mcp__<serverSlug>__<tool>`. */
const SEPARATOR = "__";

/** The two parts of an MCP tool name. `toolName` is the name the server gave the tool. */
export interface McpToolNameParts {
  serverSlug: string;
  toolName: string;
}

/**
 * Splits `mcp__<serverSlug>__<tool>`. The slug is cut at the first separator, so the slug must not
 * contain `__`. Null for a name that is not an MCP tool name or has an empty part.
 */
export function parseMcpToolName(name: string): McpToolNameParts | null {
  if (!name.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = name.slice(MCP_TOOL_PREFIX.length);
  const cut = rest.indexOf(SEPARATOR);
  if (cut <= 0 || cut + SEPARATOR.length >= rest.length) return null;
  return {
    serverSlug: rest.slice(0, cut),
    toolName: rest.slice(cut + SEPARATOR.length),
  };
}

/**
 * The name a person reads for an MCP tool: "<server> · <tool>", with the tool's original name. The
 * server name is used when known, else the slug from the tool name. Null for a name that is not an MCP
 * tool name.
 */
export function mcpDisplayName(name: string, serverName?: string): string | null {
  const parts = parseMcpToolName(name);
  if (!parts) return null;
  return `${serverName || parts.serverSlug} · ${parts.toolName}`;
}

/** One MCP server's tools, from the tool list. */
export interface McpServerToolGroup {
  serverId: string;
  serverName: string;
  tools: ToolSpec[];
}

/** The tool list split by source: the built-in tools in registry order, then one group per server. */
export interface ToolGroups {
  native: ToolSpec[];
  servers: McpServerToolGroup[];
}

/** The name shown for a server whose tool arrived without one. */
const UNNAMED_SERVER = "MCP server";

/**
 * Splits the tools into the built-in ones and one group per MCP server. Each server's tools keep the
 * registry order; the groups are sorted by server name, without case.
 */
export function groupToolsBySource(tools: ToolSpec[]): ToolGroups {
  const native: ToolSpec[] = [];
  const byServer = new Map<string, McpServerToolGroup>();

  for (const tool of tools) {
    if (tool.source !== "mcp") {
      native.push(tool);
      continue;
    }
    const serverId = tool.serverId ?? UNNAMED_SERVER;
    const existing = byServer.get(serverId);
    if (existing) {
      existing.tools.push(tool);
    } else {
      byServer.set(serverId, {
        serverId,
        serverName: tool.serverName || UNNAMED_SERVER,
        tools: [tool],
      });
    }
  }

  const servers = [...byServer.values()].sort((a, b) =>
    a.serverName.localeCompare(b.serverName, undefined, { sensitivity: "base" }),
  );
  return { native, servers };
}
