import { Switch } from "@fluentui/react-components";
import { useToolStore } from "../../../../stores/toolStore";
import type { ToolSpec } from "../../../../types";
import { chatToolStateText } from "../../../../utils/chatTools";
import type { ToolState } from "../../../../utils/toolAccess";
import { toolLabel } from "../../../../utils/toolLines";
import { Flex } from "../../../ui/Flex/Flex";
import { BodyStrong, Meta } from "../../../ui/Typography/Typography";

interface ChatToolRowProps {
  sessionId: string;
  tool: ToolSpec;
  /** The tool's global state, shown as small text. */
  state: ToolState;
  /** Whether the tool is used in this chat. */
  enabled: boolean;
  /** False when the model cannot be offered the tool now (no search source on). The switch is then disabled. */
  offerable: boolean;
}

/** One tool in the chips popover: its name, its global state and the switch that uses it in this chat. */
export function ChatToolRow({ sessionId, tool, state, enabled, offerable }: ChatToolRowProps) {
  const setChatToolEnabled = useToolStore((s) => s.setChatToolEnabled);
  const label = toolLabel(tool.name);

  return (
    <Flex direction="column" gap="xxs" role="group" aria-label={label}>
      <Flex align="center" justify="between" gap="s">
        <BodyStrong>{label}</BodyStrong>
        <Meta>{chatToolStateText(state, offerable)}</Meta>
      </Flex>
      <Switch
        label="Use in this chat"
        checked={enabled}
        disabled={!offerable}
        onChange={(_, data) => setChatToolEnabled(sessionId, tool.name, data.checked)}
      />
    </Flex>
  );
}
