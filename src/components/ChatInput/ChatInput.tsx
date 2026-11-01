import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Textarea,
} from "@fluentui/react-components";
import { AttachRegular, SendRegular, StopRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { pickAttachment, readAttachment } from "../../services/attachments";
import { stopSummary } from "../../services/chatCompaction";
import {
  historyForNewPrompt,
  recordPrompt,
  retryPrompt,
  sendPrompt,
} from "../../services/chatSend";
import * as geniex from "../../services/geniex";
import { useChatStore } from "../../stores/chatStore";
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
import { useActiveModelEntries } from "./useActiveModelEntries";
import "./ChatInput.css";

/** The message box grows from one row up to this many rows, then scrolls. */
const MAX_INPUT_ROWS = 5;

/** Attach menu entries, in menu order. */
const ATTACH_KINDS: AttachmentKind[] = ["image", "audio", "text"];

export default function ChatInput() {
  const [text, setText] = useState("");
  /** Files picked for the next message. Sent with it, then cleared. */
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    if ((!content && pending.length === 0) || !activeSessionId || busy) return;
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
  }, [text, pending, activeSessionId, busy, serverStatus.running]);

  /** Stop the reply being streamed, or the summary being written, whichever is running. */
  const handleStop = useCallback(async () => {
    try {
      if (compacting) await stopSummary();
      else await geniex.cancelChatCompletion();
    } catch (err) {
      console.error("Failed to stop generation:", err);
    }
  }, [compacting]);

  /** Handle retry. The request is cleared at once, so it runs once. */
  useEffect(() => {
    if (!retryFromMessageId || !activeSessionId || busy) return;
    const messageId = retryFromMessageId;
    setRetryFromMessageId(null);
    void retryPrompt(activeSessionId, messageId);
  }, [retryFromMessageId, activeSessionId, busy, setRetryFromMessageId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Fit the textarea to its content, capped at MAX_INPUT_ROWS rows. Runs whenever the text changes, including after a send clears it. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger, the height is read from the DOM
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const computed = getComputedStyle(el);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const chrome =
      Number.parseFloat(computed.paddingTop) +
      Number.parseFloat(computed.paddingBottom) +
      Number.parseFloat(computed.borderTopWidth) +
      Number.parseFloat(computed.borderBottomWidth);
    const maxHeight = lineHeight * MAX_INPUT_ROWS + chrome;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [text]);

  const isDisabled = (!text.trim() && pending.length === 0) || busy || !serverStatus.running;
  const stopLabel = compacting ? "Stop summarising" : "Stop generation";

  return (
    <div className="chat-input__area">
      {pending.length > 0 && (
        <div className="chat-input__attachments">
          <AttachmentList attachments={pending} onRemove={removePending} />
        </div>
      )}
      <div className="chat-input__wrapper">
        <Menu positioning="above-start">
          <MenuTrigger disableButtonEnhancement>
            <Button
              type="button"
              appearance="secondary"
              className="chat-input__action-button"
              disabled={busy}
              title="Attach a file"
              aria-label="Attach a file"
            >
              <AttachRegular />
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {/* Kinds the active model cannot take are left out, not shown disabled. */}
              {ATTACH_KINDS.filter((kind) => attachmentGate(kind, modelEntries).allowed).map(
                (kind) => {
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
                },
              )}
            </MenuList>
          </MenuPopover>
        </Menu>
        <Textarea
          ref={textareaRef}
          className="chat-input__field"
          resize="none"
          value={text}
          onChange={(_, data) => setText(data.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            serverStatus.running
              ? "Type a message… (Shift+Enter for new line)"
              : "Start the GenieX server to chat"
          }
          rows={1}
          disabled={busy}
          aria-label="Message"
        />
        {busy ? (
          <Button
            type="button"
            appearance="secondary"
            className="chat-input__action-button"
            onClick={handleStop}
            title={stopLabel}
            aria-label={stopLabel}
          >
            <StopRegular />
          </Button>
        ) : (
          <Button
            type="button"
            appearance="primary"
            className="chat-input__action-button"
            onClick={handleSend}
            disabled={isDisabled}
            aria-label="Send message"
          >
            <SendRegular />
          </Button>
        )}
      </div>
    </div>
  );
}
