import type { McpServerToolGroup } from "../../../utils/mcpTools";
import { Flex } from "../../ui/Flex/Flex";
import { BodyStrong, Secondary } from "../../ui/Typography/Typography";
import { ToolCard } from "./ToolCard";

interface McpToolGroupsProps {
  /** One group per running MCP server, already sorted by name. */
  groups: McpServerToolGroup[];
}

/**
 * The tools of the MCP servers, under each server's name and apart from the built-in tools. Each tool
 * has the same three-way state as the others, Off by default.
 */
export function McpToolGroups({ groups }: McpToolGroupsProps) {
  if (groups.length === 0) return null;

  return (
    <Flex direction="column" gap="m">
      <BodyStrong>Tools from MCP servers</BodyStrong>
      <Secondary>
        Each server's tools are listed under its name. A server's tools come from a program or a web
        address you chose, not from LocalGenie. Turn a tool on only if you trust its server.
      </Secondary>
      {groups.map((group) => (
        <Flex key={group.serverId} direction="column" gap="s">
          <BodyStrong>{group.serverName}</BodyStrong>
          {group.tools.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </Flex>
      ))}
    </Flex>
  );
}
