import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sendMessage, turnBlockReason } from "../../../services/dispatchRunner";
import { useDispatchStore } from "../../../stores/dispatchStore";
import { useToolStore } from "../../../stores/toolStore";
import type { DispatchTask } from "../../../types";
import { allowedToolNames, effectiveDispatchStates } from "../../../utils/dispatchTools";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";
import type { ToolSwitches } from "../../ChatInput/ToolsChip/ToolsChip";

/** What the new-conversation pane reads and does. */
export interface NewConversationState {
  /** The draft's tool switches: the tools switched off before the conversation exists. */
  switches: ToolSwitches;
  /** Creates the conversation with this text as its first message, and opens it. Resolves to true when it was created. */
  send: (text: string) => Promise<boolean>;
}

/**
 * The new-conversation pane's state. The tool choice is a local draft: it is written to the session once the
 * conversation is created, before its first turn. Sending the first message creates the conversation, stores
 * the message and starts the turn.
 */
export function useNewConversation(): NewConversationState {
  const navigate = useNavigate();
  const [switchedOff, setSwitchedOff] = useState<string[]>([]);

  const toggleTool = (toolName: string, enabled: boolean) => {
    setSwitchedOff((current) => {
      const others = current.filter((name) => name !== toolName);
      return enabled ? others : [...others, toolName];
    });
  };

  const send = async (text: string): Promise<boolean> => {
    const refusal = turnBlockReason(null);
    if (refusal) {
      toast.error("Could not start the conversation", refusal);
      return false;
    }
    const created = await createConversation(text, switchedOff);
    if (!created) return false;
    navigate(`/dispatch/${created.id}`);
    try {
      await sendMessage(created.id, text);
    } catch (err) {
      toast.error("Could not send the message", errorMessage(err));
    }
    return true;
  };

  return { switches: { disabled: switchedOff, onToggle: toggleTool }, send };
}

/**
 * Creates the conversation recorded with the tools On or Request approval (Dispatch states) and not switched off in the draft, then writes the
 * draft's switches to its session. Null, with a toast, when it cannot be created.
 */
async function createConversation(
  text: string,
  switchedOff: string[],
): Promise<DispatchTask | null> {
  const tools = useToolStore.getState();
  try {
    const task = await useDispatchStore.getState().create(
      text,
      allowedToolNames(
        tools.tools,
        effectiveDispatchStates(
          tools.tools.map((spec) => spec.name),
          tools.dispatchStates,
        ),
        switchedOff,
      ),
    );
    for (const name of switchedOff) tools.setChatToolEnabled(task.sessionId, name, false);
    return task;
  } catch (err) {
    toast.error("Could not create the conversation", errorMessage(err));
    return null;
  }
}
