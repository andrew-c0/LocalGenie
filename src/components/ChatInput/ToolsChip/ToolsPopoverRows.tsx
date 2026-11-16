import { chatToolGroups } from "../../../utils/chatTools";
import type { ToolEntry } from "../../../utils/toolsChip";
import { Flex } from "../../ui/Flex/Flex";
import { Meta } from "../../ui/Typography/Typography";
import { ChatToolRow } from "./ChatToolRow/ChatToolRow";

interface ToolsPopoverRowsProps {
  entries: ToolEntry[];
  /** The switch label of every row, naming where the tools are used. */
  switchLabel: string;
  onToggle: (toolName: string, enabled: boolean) => void;
}

/** The popover's tools, grouped: the built-in tools first, then one titled group per MCP server. */
export function ToolsPopoverRows({ entries, switchLabel, onToggle }: ToolsPopoverRowsProps) {
  const entryByName = new Map(entries.map((entry) => [entry.tool.name, entry]));
  const groups = chatToolGroups(entries.map((entry) => entry.tool));

  return (
    <>
      {groups.map((group) => (
        <Flex key={group.key} direction="column" gap="s">
          {group.title && <Meta>{group.title}</Meta>}
          {group.tools.map((tool) => {
            const entry = entryByName.get(tool.name);
            if (!entry) return null;
            return (
              <ChatToolRow
                key={tool.name}
                entry={entry}
                switchLabel={switchLabel}
                onChange={(enabled) => onToggle(tool.name, enabled)}
              />
            );
          })}
        </Flex>
      ))}
    </>
  );
}
