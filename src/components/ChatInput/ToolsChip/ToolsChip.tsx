import { Button, Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-components";
import { WrenchRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { routeById } from "../../../navigation/routeUtils";
import { useToolStore } from "../../../stores/toolStore";
import { activeChatToolCount, chatToolRows, chatToolsLabel } from "../../../utils/chatTools";
import { Flex } from "../../ui/Flex/Flex";
import { BodyStrong } from "../../ui/Typography/Typography";
import { ChatToolRow } from "./ChatToolRow/ChatToolRow";
import "./ToolsChip.css";

const TOOL_SETTINGS_PATH = routeById("settings-tools")?.path ?? "/settings/tools";

interface ToolsChipProps {
  /** The open chat. Its per-chat switches are the ones the popover changes. */
  sessionId: string;
}

/**
 * The composer's tools chip: "Tools" with the count of tools active in this chat. It opens a popover
 * with one switch per tool whose global state is not off. Renders nothing when no tool is on globally.
 */
export function ToolsChip({ sessionId }: ToolsChipProps) {
  const navigate = useNavigate();
  const tools = useToolStore((s) => s.tools);
  const states = useToolStore((s) => s.states);
  const chatDisabled = useToolStore((s) => s.chatDisabled);

  const rows = chatToolRows(tools, states);
  if (rows.length === 0) return null;

  const disabled = chatDisabled[sessionId] ?? [];
  const active = activeChatToolCount(rows, disabled);

  return (
    <Popover positioning="above-start">
      <PopoverTrigger disableButtonEnhancement>
        <Button
          type="button"
          size="small"
          appearance="secondary"
          icon={<WrenchRegular />}
          title={chatToolsLabel(active)}
          aria-label={chatToolsLabel(active)}
        >
          {`Tools ${active}`}
        </Button>
      </PopoverTrigger>
      <PopoverSurface className="tools-chip__surface">
        <Flex direction="column" gap="s">
          <BodyStrong>Tools for this chat</BodyStrong>
          {rows.map((tool) => (
            <ChatToolRow
              key={tool.name}
              sessionId={sessionId}
              tool={tool}
              state={states[tool.name] ?? "off"}
              enabled={!disabled.includes(tool.name)}
            />
          ))}
          <Button appearance="subtle" onClick={() => navigate(TOOL_SETTINGS_PATH)}>
            Tool settings
          </Button>
        </Flex>
      </PopoverSurface>
    </Popover>
  );
}
