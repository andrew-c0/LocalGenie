import { Badge, Field, Radio, RadioGroup } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { useToolStore } from "../../../stores/toolStore";
import type { ToolSpec } from "../../../types";
import { dispatchStateOf } from "../../../utils/dispatchTools";
import {
  parseToolState,
  TOOL_STATE_HELP,
  TOOL_STATE_LABEL,
  TOOL_STATES,
} from "../../../utils/toolAccess";
import { toolCardLock } from "../../../utils/toolCardLock";
import { toolLabel } from "../../../utils/toolLines";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { Meta, Secondary } from "../../ui/Typography/Typography";

/** The one extra line a tool's card shows under its description. */
const TOOL_NOTES: Record<string, string> = {
  read_image:
    "Reads an image in an allowed folder and shows it to the model. Only a model whose settings scan confirms vision can see it.",
  web_fetch:
    "Downloads the page at an address the model chooses, from the internet. Text it returns is untrusted; the model may be steered by instructions inside a page.",
};

interface ToolCardProps {
  tool: ToolSpec;
  /** Extra options of this tool, shown under its state (for example the search sources). */
  children?: ReactNode;
}

/**
 * One tool: its name, what it does, and two three-way states (Off, Request approval, On): one for chats and one
 * for Dispatch conversations, which use their own settings. A Dispatch state never set is On.
 */
export function ToolCard({ tool, children }: ToolCardProps) {
  const label = toolLabel(tool.name, tool.serverName);
  const state = useToolStore((s) => s.states[tool.name] ?? "off");
  const setState = useToolStore((s) => s.setState);
  const dispatchState = useToolStore((s) => dispatchStateOf(tool.name, s.dispatchStates));
  const setDispatchState = useToolStore((s) => s.setDispatchState);
  const enabledSearchSources = useToolStore((s) => s.enabledSearchSources);
  const searchSources = useToolStore((s) => s.searchSources);
  const note = TOOL_NOTES[tool.name];
  const lock = toolCardLock(tool, enabledSearchSources, searchSources);
  const isMcp = tool.source === "mcp";

  return (
    <SurfaceCard title={label}>
      <Flex direction="column" gap="s">
        {isMcp && (
          <Flex align="center" gap="s" wrap>
            <Badge appearance="tint" size="small">
              MCP
            </Badge>
            <Meta>Comes from an external server you added.</Meta>
          </Flex>
        )}
        {tool.risk === "network" && <Meta>Uses the internet</Meta>}
        <Secondary>{tool.description}</Secondary>
        {lock.note && <Meta>{lock.note}</Meta>}
        {note && <Secondary>{note}</Secondary>}
        <Field label="Chat">
          <RadioGroup
            layout="horizontal"
            aria-label={`Chat access to ${label}`}
            disabled={lock.locked}
            value={state}
            onChange={(_, data) => void setState(tool.name, parseToolState(data.value))}
          >
            {TOOL_STATES.map((option) => (
              <Radio key={option} value={option} label={TOOL_STATE_LABEL[option]} />
            ))}
          </RadioGroup>
        </Field>
        <Meta>{TOOL_STATE_HELP[state]}</Meta>
        <Field label="Dispatch">
          <RadioGroup
            layout="horizontal"
            aria-label={`Dispatch access to ${label}`}
            disabled={lock.locked}
            value={dispatchState}
            onChange={(_, data) => void setDispatchState(tool.name, parseToolState(data.value))}
          >
            {TOOL_STATES.map((option) => (
              <Radio key={option} value={option} label={TOOL_STATE_LABEL[option]} />
            ))}
          </RadioGroup>
        </Field>
        <Meta>{TOOL_STATE_HELP[dispatchState]}</Meta>
        <Meta>Dispatch conversations use this unless you change it.</Meta>
        {children}
      </Flex>
    </SurfaceCard>
  );
}
