import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from "@fluentui/react-components";
import { AttachRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import { pickAttachment, readAttachment } from "../../services/attachments";
import { stopSummary } from "../../services/chatCompaction";
import {
  historyForNewPrompt,
  recordPrompt,
  retryPrompt,
  sendPrompt,
} from "../../services/chatSend";
import * as geniex from "../../services/geniex";
import { abortToolLoop } from "../../services/toolLoop";
import { useChatStore } from "../../stores/chatStore";
import { useDispatchStore } from "../../stores/dispatchStore";
import { useModelStore } from "../../stores/modelStore";
import type { AttachmentKind, Message } from "../../types";
import {
  attachmentGate,
  attachmentKindLabel,
  attachmentRef,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type PendingAttachment,
} from "../../utils/attachments";
import { toast } from "../../utils/toast";
import { AttachmentList, KIND_ICON } from "../chat/AttachmentList/AttachmentList";
import { MessageComposer } from "../ui/MessageComposer/MessageComposer";
import { ToolsChip } from "./ToolsChip/ToolsChip";
import { useActiveModelEntries } from "./useActiveModelEntries";
import "./ChatInput.css";

/** Attach menu entries, in menu order. */
const ATTACH_KINDS: AttachmentKind[] = ["image", "audio", "text"];

export default function ChatInput() {
  const [text, setText] = useState("");
  /** Files picked for the next message. Sent with it, then cleared. */
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const compacting = useChatStore((s) => s.compacting);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const modelEntries = useActiveModelEntries(activeModelId);
  const retryFromMessageId = useChatStore((s) => s.retryFromMessageId);
  const setRetryFromMessageId = useChatStore((s) => s.setRetryFromMessageId);
  /** A reply or a summary is in progress. The input waits, and stop ends whichever runs. */
  const busy = isStreaming || compacting;
  /** A Dispatch conversation's turn uses the model. The input stays off until that turn ends. */
  const dispatchRunning = useDispatchStore((s) => s.runningTaskId !== null);
  const locked = busy || dispatchRunning;

  /** Pick a file of one kind from the attach menu and read it for the next message. */
  const handleAttach = useCallback(
    async (kind: AttachmentKind) => {
      if (pending.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        toast.info(
          "Attachment limit",
          `A message takes up to ${MAX_ATTACHMENTS_PER_MESSAGE} files. Remove one to add another.`,
        );
        return;
      }
      try {
        const path = await pickAttachment(kind);
        if (!path) return;
        const file = await readAttachment(path);
        setPending((files) => [...files, { ...file, id: crypto.randomUUID() }]);
      } catch (err) {
        toast.error("Attachment failed", String(err));
      }
    },
    [pending.length],
  );

  const removePending = useCallback((id: string) => {
    setPending((files) => files.filter((f) => f.id !== id));
  }, []);

  /** Handle a normal new-message send. */
  const handleSend = useCallback(async () => {
    const content = text.trim();
    if ((!content && pending.length === 0) || !activeSessionId || locked) return;
    if (!serverStatus.running) return;

    const files = pending;
    const prompt: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
      attachments: files.length > 0 ? files.map(attachmentRef) : undefined,
    };
    const history = await historyForNewPrompt(activeSessionId, prompt, files);
    if (!history) return;

    setText("");
    setPending([]);
    await recordPrompt(activeSessionId, prompt);
    await sendPrompt(activeSessionId, prompt, history, files);
  }, [text, pending, activeSessionId, locked, serverStatus.running]);

  /**
   * Stop the reply being streamed, or the summary being written, whichever is running. A reply's tool
   * loop stops too, so no further request or tool call runs. The stream's session is used when it has
   * one; between requests (while a tool runs) the open chat is the loop's chat.
   */
  const handleStop = useCallback(async () => {
    try {
      if (compacting) {
        await stopSummary();
        return;
      }
      const loopSessionId = useChatStore.getState().activeStream?.sessionId ?? activeSessionId;
      if (loopSessionId) abortToolLoop(loopSessionId);
      await geniex.cancelChatCompletion();
    } catch (err) {
      console.error("Failed to stop generation:", err);
    }
  }, [compacting, activeSessionId]);

  /** Handle retry. The request is cleared at once, so it runs once. */
  useEffect(() => {
    if (!retryFromMessageId || !activeSessionId || locked) return;
    const messageId = retryFromMessageId;
    setRetryFromMessageId(null);
    void retryPrompt(activeSessionId, messageId);
  }, [retryFromMessageId, activeSessionId, locked, setRetryFromMessageId]);

  const isDisabled = (!text.trim() && pending.length === 0) || locked || !serverStatus.running;
  const stopLabel = compacting ? "Stop summarising" : "Stop generation";

  /** Kinds the active model cannot take are left out, not shown disabled. */
  const attachMenu = (
    <Menu positioning="above-start">
      <MenuTrigger disableButtonEnhancement>
        <Button
          type="button"
          appearance="secondary"
          className="message-composer__button"
          disabled={locked}
          title="Attach a file"
          aria-label="Attach a file"
        >
          <AttachRegular />
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {ATTACH_KINDS.filter((kind) => attachmentGate(kind, modelEntries).allowed).map((kind) => {
            const Icon = KIND_ICON[kind];
            return (
              <MenuItem
                key={kind}
                icon={<Icon className={`attachment-kind--${kind}`} />}
                onClick={() => handleAttach(kind)}
              >
                {attachmentKindLabel(kind)}
              </MenuItem>
            );
          })}
        </MenuList>
      </MenuPopover>
    </Menu>
  );

  return (
    <div className="conversation-canvas__composer">
      {pending.length > 0 && (
        <div className="chat-input__attachments">
          <AttachmentList attachments={pending} onRemove={removePending} />
        </div>
      )}
      <MessageComposer
        value={text}
        onChange={setText}
        onSubmit={handleSend}
        placeholder={
          serverStatus.running
            ? "Type a message… (Shift+Enter for new line)"
            : "Start the GenieX server to chat"
        }
        disabled={locked}
        leading={attachMenu}
        action={
          busy
            ? { kind: "stop", label: stopLabel, onStop: handleStop }
            : { kind: "send", disabled: isDisabled, onSend: handleSend }
        }
        note={dispatchRunning ? "Dispatch is using the model" : null}
        tools={activeSessionId ? <ToolsChip mode="chat" sessionId={activeSessionId} /> : null}
      />
    </div>
  );
}
