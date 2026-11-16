import { useTurnAvailability } from "../../../hooks/useTurnAvailability";
import { DispatchInput } from "../DispatchInput/DispatchInput";
import { useNewConversation } from "./useNewConversation";

/**
 * The message field at the bottom of the Dispatch landing. Sending its first message creates the conversation
 * and opens it. The tools popup chooses the tools the conversation may use.
 */
export function NewConversation() {
  const { blocker, queuedNote } = useTurnAvailability(null);
  const { switches, send } = useNewConversation();

  return (
    <DispatchInput
      blocker={blocker}
      queuedNote={queuedNote}
      showStop={false}
      onSend={send}
      switches={switches}
      placeholder="Message Dispatch… (Shift+Enter for new line)"
    />
  );
}
