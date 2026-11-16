import {
  Button,
  MessageBar,
  MessageBarBody,
  Popover,
  PopoverSurface,
  PopoverTrigger,
} from "@fluentui/react-components";
import { WrenchRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { routeById } from "../../../navigation/routeUtils";
import { useToolStore } from "../../../stores/toolStore";
import { chatToolRows, chatToolsLabel } from "../../../utils/chatTools";
import {
  conversationToolsLabel,
  effectiveDispatchStates,
  RISK_WARNING,
  riskWarning,
} from "../../../utils/dispatchTools";
import { checkedCount, toolEntriesOf } from "../../../utils/toolsChip";
import { Flex } from "../../ui/Flex/Flex";
import { BodyStrong } from "../../ui/Typography/Typography";
import { ToolsPopoverRows } from "./ToolsPopoverRows";
import "./ToolsChip.css";

const TOOL_SETTINGS_PATH = routeById("settings-tools")?.path ?? "/settings/tools";

/**
 * The tools switched off for one conversation, and the way to switch one. A chat reads and writes its
 * session in the tool store; a Dispatch conversation (or its new-conversation draft) passes its own.
 */
export interface ToolSwitches {
  disabled: readonly string[];
  onToggle: (toolName: string, enabled: boolean) => void;
}

export type ToolsChipProps =
  | {
      /** A chat: its per-chat switches are the session's entries in the tool store. */
      mode: "chat";
      sessionId: string;
    }
  | {
      /** A Dispatch conversation. Every tool is listed; an Off tool (in the Dispatch states) is disabled. */
      mode: "dispatch";
      switches: ToolSwitches;
    };

/**
 * The composer's tools chip: "Tools" with the count of tools in use. It opens a popover with one switch per
 * tool. A chat lists the tools that are not Off. A Dispatch conversation lists all of them, with their Dispatch
 * states, and uses the ones that are On or Request approval; a read tool with a network tool shows the risk
 * warning. Renders nothing when there are no tools.
 */
export function ToolsChip(props: ToolsChipProps) {
  const navigate = useNavigate();
  const tools = useToolStore((s) => s.tools);
  const chatStates = useToolStore((s) => s.states);
  const dispatchStates = useToolStore((s) => s.dispatchStates);
  const chatDisabled = useToolStore((s) => s.chatDisabled);
  const setChatToolEnabled = useToolStore((s) => s.setChatToolEnabled);
  const enabledSearchSources = useToolStore((s) => s.enabledSearchSources);
  const searchSources = useToolStore((s) => s.searchSources);

  const isDispatch = props.mode === "dispatch";
  const switches: ToolSwitches =
    props.mode === "dispatch"
      ? props.switches
      : {
          disabled: chatDisabled[props.sessionId] ?? [],
          onToggle: (name, enabled) => setChatToolEnabled(props.sessionId, name, enabled),
        };

  // A Dispatch conversation shows the Dispatch state of each tool; a chat shows the chat states.
  const states = isDispatch
    ? effectiveDispatchStates(
        tools.map((spec) => spec.name),
        dispatchStates,
      )
    : chatStates;
  const rows = isDispatch ? tools : chatToolRows(tools, states);
  if (rows.length === 0) return null;

  const entries = toolEntriesOf(rows, {
    isDispatch,
    states,
    enabledSearchSources,
    searchSources,
    disabled: switches.disabled,
  });
  const active = checkedCount(entries);
  const label = isDispatch ? conversationToolsLabel(active) : chatToolsLabel(active);
  const offered = entries.filter((entry) => entry.checked).map((entry) => entry.tool.name);

  return (
    <Popover positioning="above-start">
      <PopoverTrigger disableButtonEnhancement>
        <Button
          type="button"
          size="small"
          appearance="secondary"
          icon={<WrenchRegular />}
          title={label}
          aria-label={label}
        >
          {`Tools ${active}`}
        </Button>
      </PopoverTrigger>
      <PopoverSurface className="tools-chip__surface">
        <Flex direction="column" gap="s">
          <BodyStrong>
            {isDispatch ? "Tools for this conversation" : "Tools for this chat"}
          </BodyStrong>
          {isDispatch && riskWarning(tools, offered) && (
            <MessageBar intent="warning">
              <MessageBarBody>{RISK_WARNING}</MessageBarBody>
            </MessageBar>
          )}
          <ToolsPopoverRows
            entries={entries}
            switchLabel={isDispatch ? "Use in this conversation" : "Use in this chat"}
            onToggle={switches.onToggle}
          />
          <Button appearance="subtle" onClick={() => navigate(TOOL_SETTINGS_PATH)}>
            Tool settings
          </Button>
        </Flex>
      </PopoverSurface>
    </Popover>
  );
}
