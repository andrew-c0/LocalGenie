import { Switch } from "@fluentui/react-components";
import { toolLabel } from "../../../../utils/toolLines";
import type { ToolEntry } from "../../../../utils/toolsChip";
import { Flex } from "../../../ui/Flex/Flex";
import { BodyStrong, Meta } from "../../../ui/Typography/Typography";

interface ChatToolRowProps {
  entry: ToolEntry;
  /** The switch's label, naming where the tool is used. */
  switchLabel: string;
  onChange: (enabled: boolean) => void;
}

/** One tool in the tools popover: its name, its state and the switch that uses it here. */
export function ChatToolRow({ entry, switchLabel, onChange }: ChatToolRowProps) {
  const { tool } = entry;
  const label = toolLabel(tool.name, tool.serverName);

  return (
    <Flex direction="column" gap="xxs" role="group" aria-label={label}>
      <Flex align="center" justify="between" gap="s">
        <BodyStrong>{label}</BodyStrong>
        <Meta>{entry.stateText}</Meta>
      </Flex>
      <Switch
        label={switchLabel}
        checked={entry.checked}
        disabled={!entry.available}
        onChange={(_, data) => onChange(data.checked)}
      />
      {entry.reason && <Meta>{entry.reason}</Meta>}
    </Flex>
  );
}
