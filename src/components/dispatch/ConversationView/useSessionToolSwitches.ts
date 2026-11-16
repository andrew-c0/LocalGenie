import { useToolStore } from "../../../stores/toolStore";
import type { ToolSwitches } from "../../ChatInput/ToolsChip/ToolsChip";

const NO_SWITCHES: string[] = [];

/** The tool switches of a conversation's session, read from and written to the tool store. */
export function useSessionToolSwitches(sessionId: string): ToolSwitches {
  const disabled = useToolStore((s) => s.chatDisabled[sessionId]) ?? NO_SWITCHES;
  const setChatToolEnabled = useToolStore((s) => s.setChatToolEnabled);
  return {
    disabled,
    onToggle: (toolName, enabled) => setChatToolEnabled(sessionId, toolName, enabled),
  };
}
