import type { McpTestResult } from "../../../../../../types";
import { shortDescription, toolCountLabel } from "../../../../../../utils/mcpServers";
import { Flex } from "../../../../../ui/Flex/Flex";
import { BodyStrong, Meta } from "../../../../../ui/Typography/Typography";
import { McpErrorText } from "../../McpErrorText/McpErrorText";
import "./McpTestPanel.css";

interface McpTestPanelProps {
  result: McpTestResult;
}

/**
 * The outcome of a connection test: "Connected, N tools" with the tool names and short descriptions, or
 * the reason the server did not connect, with its line breaks kept.
 */
export function McpTestPanel({ result }: McpTestPanelProps) {
  if (!result.ok) {
    return (
      <Flex direction="column" gap="xs" className="mcp-test-panel">
        <BodyStrong>The server did not connect</BodyStrong>
        <McpErrorText text={result.error ?? "The server gave no reason."} />
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="xs" className="mcp-test-panel">
      <BodyStrong>Connected, {toolCountLabel(result.tools.length)}</BodyStrong>
      {result.tools.length > 0 && (
        <ul className="mcp-test-panel__tools">
          {result.tools.map((tool) => (
            <li key={tool.name} className="mcp-test-panel__tool">
              <code className="mcp-test-panel__name">{tool.name}</code>
              {tool.description && <Meta>{shortDescription(tool.description)}</Meta>}
            </li>
          ))}
        </ul>
      )}
    </Flex>
  );
}
