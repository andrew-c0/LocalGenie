import { Button } from "@fluentui/react-components";
import { useState } from "react";
import { previewText } from "../../../../../utils/mcpServers";
import { Flex } from "../../../../ui/Flex/Flex";
import { Meta } from "../../../../ui/Typography/Typography";
import "./McpErrorText.css";

interface McpErrorTextProps {
  /** The error as the backend sent it. It may span lines, and may carry a server's stderr. */
  text: string;
}

/**
 * An error text with its line breaks kept. A long one shows its first lines, with a button to show
 * all of it or fold it back.
 */
export function McpErrorText({ text }: McpErrorTextProps) {
  const [expanded, setExpanded] = useState(false);
  const { preview, truncated } = previewText(text);

  return (
    <Flex direction="column" gap="xs" align="start">
      <Meta className="mcp-error-text">
        {expanded || !truncated ? text.trimEnd() : `${preview}…`}
      </Meta>
      {truncated && (
        <Button
          size="small"
          appearance="subtle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </Flex>
  );
}
