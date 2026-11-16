import { useState } from "react";
import { type ToolSwitches, ToolsChip } from "../../ChatInput/ToolsChip/ToolsChip";
import { MessageComposer } from "../../ui/MessageComposer/MessageComposer";

interface DispatchInputProps {
  /** Why a message cannot be sent now, shown under the field. Null when it can. */
  blocker: string | null;
  /** Shown under the field when the message will wait behind another conversation. */
  queuedNote: string | null;
  /** The conversation's turn works or waits: Stop replaces Send. */
  showStop: boolean;
  /** Sends the text. Resolves to true when it was accepted, and the field is then cleared. */
  onSend: (text: string) => Promise<boolean>;
  onStop?: () => void;
  /** The conversation's tool switches, for the tools popup under the field. */
  switches: ToolSwitches;
  placeholder: string;
}

/**
 * The message field under a Dispatch conversation: the shared composer, with the conversation's tools popup
 * under it. Enter sends, Shift+Enter starts a line, and Stop replaces Send while the conversation works.
 */
export function DispatchInput({
  blocker,
  queuedNote,
  showStop,
  onSend,
  onStop,
  switches,
  placeholder,
}: DispatchInputProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const content = text.trim();
  const canSend = content !== "" && blocker === null && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      if (await onSend(content)) setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="conversation-canvas__composer">
      <MessageComposer
        value={text}
        onChange={setText}
        onSubmit={send}
        placeholder={placeholder}
        disabled={blocker !== null}
        action={
          showStop && onStop
            ? { kind: "stop", label: "Stop conversation", onStop }
            : { kind: "send", disabled: !canSend, onSend: send }
        }
        note={blocker ?? queuedNote}
        tools={<ToolsChip mode="dispatch" switches={switches} />}
      />
    </div>
  );
}
