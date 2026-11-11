import { Field, Radio, RadioGroup } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { useToolStore } from "../../../stores/toolStore";
import type { ToolSpec } from "../../../types";
import {
  parseToolState,
  TOOL_STATE_HELP,
  TOOL_STATE_LABEL,
  TOOL_STATES,
} from "../../../utils/toolAccess";
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

/** One tool: its name, what it does, its three-way state (Off, Request approval, On) and what that state means. */
export function ToolCard({ tool, children }: ToolCardProps) {
  const label = toolLabel(tool.name);
  const state = useToolStore((s) => s.states[tool.name] ?? "off");
  const setState = useToolStore((s) => s.setState);
  const note = TOOL_NOTES[tool.name];

  return (
    <SurfaceCard title={label}>
      <Flex direction="column" gap="s">
        {tool.risk === "network" && <Meta>Uses the internet</Meta>}
        <Secondary>{tool.description}</Secondary>
        {note && <Secondary>{note}</Secondary>}
        <Field label="Access">
          <RadioGroup
            layout="horizontal"
            aria-label={`Access to ${label}`}
            value={state}
            onChange={(_, data) => void setState(tool.name, parseToolState(data.value))}
          >
            {TOOL_STATES.map((option) => (
              <Radio key={option} value={option} label={TOOL_STATE_LABEL[option]} />
            ))}
          </RadioGroup>
        </Field>
        <Meta>{TOOL_STATE_HELP[state]}</Meta>
        {children}
      </Flex>
    </SurfaceCard>
  );
}
