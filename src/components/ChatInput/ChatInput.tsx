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
import * as db from "../../services/database";
import * as geniex from "../../services/geniex";
import { serverBaseUrl } from "../../services/geniex";
import { loadModelCapabilities } from "../../services/models";
import * as systemService from "../../services/system";
import { useChatStore } from "../../stores/chatStore";
import { defaultSettings, useModelStore } from "../../stores/modelStore";
import type {
  AttachmentKind,
  AttachmentRef,
  ChatMessageContent,
  Message,
  StoredModelSettings,
} from "../../types";
import {
  attachmentGate,
  attachmentKindLabel,
  attachmentRef,
  blockedKinds,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type PendingAttachment,
  userMessageContent,
} from "../../utils/attachments";
import { chatErrorContent } from "../../utils/chatError";
import { chatSettingsFor, engineOf, modelSettingsKey } from "../../utils/modelSettings";
import {
  composeSystemPrompt,
  localTimeZone,
  type PlatformSnapshot,
  withSystemBlocks,
} from "../../utils/systemPrompt";
import { toast } from "../../utils/toast";
import { AttachmentList, KIND_ICON } from "../chat/AttachmentList/AttachmentList";
import { useActiveModelEntries } from "./useActiveModelEntries";
import "./ChatInput.css";

/** The message box grows from one row up to this many rows, then scrolls. */
const MAX_INPUT_ROWS = 5;

/** Attach menu entries, in menu order. */
const ATTACH_KINDS: AttachmentKind[] = ["image", "audio", "text"];

/** Files of a stored message that were read again, and the names of those that are no longer there. */
interface StoredFiles {
  files: PendingAttachment[];
  unavailable: string[];
}

/**
 * Read a stored message's files again from their paths. A file with no stored path, or no longer on
 * the device, is left out and named in `unavailable`. A file that is there but cannot be read still
 * throws.
 */
async function readStoredFiles(refs: AttachmentRef[]): Promise<StoredFiles> {
  const files: PendingAttachment[] = [];
  const unavailable: string[] = [];
  for (const ref of refs) {
    if (!ref.path || !(await systemService.fileExists(ref.path))) {
      unavailable.push(ref.name);
      continue;
    }
    files.push({ ...(await readAttachment(ref.path)), id: ref.id });
  }
  return { files, unavailable };
}

/** Tells the user which files the model will not see because they are no longer on the device. */
function warnUnavailable(names: string[]) {
  toast.info(
    "Files not sent",
    `No longer on this device: ${names.join(", ")}. The model will not see them. Delete the message to stop this warning.`,
  );
}

/** A chat message as the server takes it. */
type ApiMessage = { role: "user" | "assistant" | "system"; content: ChatMessageContent };

/** Chat history for the server, and the names of stored files it had to leave out. */
interface History {
  history: ApiMessage[];
  unavailable: string[];
}

/**
 * Chat history for the server. Every user message's files are read again from their paths, so the
 * model has them on every turn. `fresh` gives the files of the message being sent, which are already
 * in memory. Files no longer on the device are left out and named in `unavailable`.
 */
async function historyFor(
  messages: Message[],
  fresh?: { messageId: string; files: PendingAttachment[] },
): Promise<History> {
  const history: ApiMessage[] = [];
  const unavailable: string[] = [];
  for (const m of messages) {
    const role = m.role as ApiMessage["role"];
    if (m.role !== "user" || !m.attachments?.length) {
      history.push({ role, content: m.content });
      continue;
    }
    if (fresh?.messageId === m.id) {
      history.push({ role, content: userMessageContent(m.content, fresh.files) });
      continue;
    }
    const stored = await readStoredFiles(m.attachments);
    unavailable.push(...stored.unavailable);
    history.push({ role, content: userMessageContent(m.content, stored.files) });
  }
  return { history, unavailable };
}

/**
 * True when the active model may take these files. The model may have changed since the files were
 * attached, so its current scan result is checked. Otherwise a toast names what it cannot take.
 */
async function modelTakesFiles(files: { kind: AttachmentKind }[]): Promise<boolean> {
  if (files.length === 0) return true;
  const modelName = useModelStore.getState().activeModelId;
  const entries = modelName ? await loadModelCapabilities(modelName).catch(() => []) : null;
  const blocked = blockedKinds(files, entries);
  if (blocked.length === 0) return true;
  toast.error(
    "The model cannot take these files",
    `Not confirmed for ${blocked.map(attachmentKindLabel).join(", ")}. Run the settings scan or remove the files.`,
  );
  return false;
}

/** Platform details for a send: the OS probe plus the startup chipset. Null when the probe fails. */
async function platformForSend(): Promise<PlatformSnapshot | null> {
  try {
    const info = await systemService.getPlatformInfo();
    return { ...info, chipset: useModelStore.getState().chipset };
  } catch {
    return null;
  }
}

/** Last message in a session, read from the store. */
function lastMessageOf(sessionId: string): Message | undefined {
  const messages = useChatStore.getState().sessions.find((s) => s.id === sessionId)?.messages ?? [];
  return messages[messages.length - 1];
}

export default function ChatInput() {
  const [text, setText] = useState("");
  /** Files picked for the next message. Sent with it, then cleared. */
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addMessage = useChatStore((s) => s.addMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setLastSendTime = useChatStore((s) => s.setLastSendTime);
  const setActiveStream = useChatStore((s) => s.setActiveStream);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const serverPort = useModelStore((s) => s.serverPort);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const modelEntries = useActiveModelEntries(activeModelId);
  const retryFromMessageId = useChatStore((s) => s.retryFromMessageId);
  const setRetryFromMessageId = useChatStore((s) => s.setRetryFromMessageId);

  /** Core send logic — uses activeModelId from the model store. */
  const doSend = useCallback(
    async (
      sessionId: string,
      apiMessages: { role: "user" | "assistant" | "system"; content: ChatMessageContent }[],
    ) => {
      setStreaming(true);
      setLastSendTime(Date.now());
      const streamId = crypto.randomUUID();
      setActiveStream({ streamId, sessionId });
      // A reply has started only if a message newer than this one appears during the send.
      const priorLastId = lastMessageOf(sessionId)?.id;

      const rawModelId = useModelStore.getState().activeModelId;

      try {
        const key = rawModelId ? modelSettingsKey(rawModelId) : null;
        let stored: StoredModelSettings = { ...defaultSettings };
        let nativeContext: number | null = null;
        if (key) {
          try {
            const saved = await db.loadModelSettings(key);
            stored = withSystemBlocks({ ...defaultSettings, ...saved });
            nativeContext = await db.loadNativeContext(key);
          } catch {
            // use defaults
          }
        }
        const model = key
          ? useModelStore.getState().models.find((m) => modelSettingsKey(m.name) === key)
          : undefined;
        const composed = await composeSystemPrompt(stored.systemBlocks ?? [], {
          now: new Date(),
          timeZone: localTimeZone(),
          platform: await platformForSend(),
          readFile: systemService.readTextFile,
        });
        if (composed.skipped.length > 0) {
          toast.info(
            "Attached file skipped",
            `Could not read ${composed.skipped.join(", ")}. The reply uses the rest of the system prompt.`,
          );
        }
        const settings = {
          ...chatSettingsFor(
            stored,
            engineOf(model),
            useModelStore.getState().compute,
            nativeContext,
          ),
          systemPrompt: composed.prompt,
        };

        // Pass the model name if set, otherwise auto-detect from server
        const baseUrl = serverBaseUrl(serverPort);
        await geniex.chatCompletion(
          apiMessages,
          settings,
          streamId,
          rawModelId ?? undefined,
          baseUrl,
        );
      } catch (err) {
        console.error("Chat completion failed:", err);
        toast.error("Reply failed", String(err));
        const error = String(err);
        const timestamp = Date.now();
        // The reply in progress, if this send produced one. Its partial text is saved so the error has a stored parent.
        const last = lastMessageOf(sessionId);
        const reply =
          last && last.role === "assistant" && last.id !== priorLastId && !last.isError
            ? last
            : undefined;
        // Shown in the chat like before, and stored as a chat error so a reload restores it.
        // The error stays out of `messages`, so it is not stored twice.
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: chatErrorContent(error),
          timestamp,
          isError: true,
        };
        addMessage(sessionId, errorMsg);
        if (reply) db.saveMessage(sessionId, reply).catch(() => {});
        db.saveChatError(sessionId, {
          id: errorMsg.id,
          messageId: reply?.id ?? null,
          error,
          timestamp,
        }).catch(() => {});
        setActiveStream(null);
        setStreaming(false);
      }
    },
    [addMessage, setStreaming, setLastSendTime, setActiveStream, serverPort],
  );

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
    if ((!content && pending.length === 0) || !activeSessionId || isStreaming) return;
    if (!serverStatus.running) return;

    const files = pending;
    const session = useChatStore.getState().sessions.find((s) => s.id === activeSessionId);
    if (!session) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
      attachments: files.length > 0 ? files.map(attachmentRef) : undefined,
    };
    // Every file in the chat goes to the model on each turn, so all of them are checked.
    const sent = [...session.messages, userMsg];
    if (!(await modelTakesFiles(sent.flatMap((m) => m.attachments ?? [])))) return;

    // Built before the input is cleared, so a missing file leaves the message in the box.
    let built: History;
    try {
      built = await historyFor(sent, { messageId: userMsg.id, files });
    } catch (err) {
      toast.error("Message not sent", String(err));
      return;
    }
    if (built.unavailable.length > 0) warnUnavailable(built.unavailable);

    setText("");
    setPending([]);
    addMessage(activeSessionId, userMsg);
    await db.saveMessage(activeSessionId, userMsg).catch(() => {});

    await doSend(activeSessionId, built.history);
  }, [text, pending, activeSessionId, isStreaming, serverStatus.running, addMessage, doSend]);

  /** Stop the currently streaming model response. */
  const handleStop = useCallback(async () => {
    try {
      await geniex.cancelChatCompletion();
    } catch (err) {
      console.error("Failed to stop generation:", err);
    }
  }, []);

  /**
   * Send a user message again, with its history. Files are read again from their paths before
   * anything is removed, so a missing file stops the retry with the chat unchanged.
   */
  const retryMessage = useCallback(
    async (sessionId: string, messageId: string) => {
      const current = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      const idx = current?.messages.findIndex((m) => m.id === messageId) ?? -1;
      if (!current || idx < 0) return;

      const upToRetry = current.messages.slice(0, idx + 1);
      if (!(await modelTakesFiles(upToRetry.flatMap((m) => m.attachments ?? [])))) return;

      let built: History;
      try {
        built = await historyFor(upToRetry);
      } catch (err) {
        toast.error("Retry cancelled", String(err));
        return;
      }
      if (built.unavailable.length > 0) warnUnavailable(built.unavailable);

      // Remove every message after the retry point, from the store and the database.
      const store = useChatStore.getState();
      const latest = store.sessions.find((s) => s.id === sessionId);
      const latestIdx = latest?.messages.findIndex((m) => m.id === messageId) ?? -1;
      if (!latest || latestIdx < 0) return;
      const later = latest.messages.slice(latestIdx + 1);
      if (later.length > 0) {
        store.removeMessagesAfter(sessionId, messageId);
        for (const msg of later) {
          if (msg.isError) db.deleteChatError(msg.id).catch(() => {});
          else db.deleteMessage(msg.id).catch(() => {});
        }
      }
      await doSend(sessionId, built.history);
    },
    [doSend],
  );

  /** Handle retry. The request is cleared at once, so it runs once. */
  useEffect(() => {
    if (!retryFromMessageId || !activeSessionId || isStreaming) return;
    const messageId = retryFromMessageId;
    setRetryFromMessageId(null);
    void retryMessage(activeSessionId, messageId);
  }, [retryFromMessageId, activeSessionId, isStreaming, retryMessage, setRetryFromMessageId]);

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

  const isDisabled = (!text.trim() && pending.length === 0) || isStreaming || !serverStatus.running;

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
              disabled={isStreaming}
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
          disabled={isStreaming}
          aria-label="Message"
        />
        {isStreaming ? (
          <Button
            type="button"
            appearance="secondary"
            className="chat-input__action-button"
            onClick={handleStop}
            title="Stop generation"
            aria-label="Stop generation"
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
