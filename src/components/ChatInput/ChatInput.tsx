import { Button, Textarea } from "@fluentui/react-components";
import { SendRegular, StopRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import * as db from "../../services/database";
import * as geniex from "../../services/geniex";
import { serverBaseUrl } from "../../services/geniex";
import { useChatStore } from "../../stores/chatStore";
import { defaultSettings, useModelStore } from "../../stores/modelStore";
import type { Message } from "../../types";
import { chatErrorContent } from "../../utils/chatError";
import { toast } from "../../utils/toast";
import "./ChatInput.css";

/** The message box grows from one row up to this many rows, then scrolls. */
const MAX_INPUT_ROWS = 5;

/** Last message in a session, read from the store. */
function lastMessageOf(sessionId: string): Message | undefined {
  const messages = useChatStore.getState().sessions.find((s) => s.id === sessionId)?.messages ?? [];
  return messages[messages.length - 1];
}

export default function ChatInput() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addMessage = useChatStore((s) => s.addMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setLastSendTime = useChatStore((s) => s.setLastSendTime);
  const setActiveStream = useChatStore((s) => s.setActiveStream);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const serverPort = useModelStore((s) => s.serverPort);
  const retryFromMessageId = useChatStore((s) => s.retryFromMessageId);
  const setRetryFromMessageId = useChatStore((s) => s.setRetryFromMessageId);

  /** Core send logic — uses activeModelId from the model store. */
  const doSend = useCallback(
    async (
      sessionId: string,
      apiMessages: { role: "user" | "assistant" | "system"; content: string }[],
    ) => {
      setStreaming(true);
      setLastSendTime(Date.now());
      const streamId = crypto.randomUUID();
      setActiveStream({ streamId, sessionId });
      // A reply has started only if a message newer than this one appears during the send.
      const priorLastId = lastMessageOf(sessionId)?.id;

      const rawModelId = useModelStore.getState().activeModelId;

      try {
        let settings = { ...defaultSettings };
        if (rawModelId) {
          const baseName = rawModelId.includes(":") ? rawModelId.split(":")[0] : rawModelId;
          try {
            const saved = await db.loadModelSettings(baseName);
            if (saved) settings = { ...settings, ...JSON.parse(saved) };
          } catch {
            // use defaults
          }
        }

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

  /** Handle a normal new-message send. */
  const handleSend = useCallback(async () => {
    if (!text.trim() || !activeSessionId || isStreaming) return;
    if (!serverStatus.running) return;

    const content = text.trim();
    setText("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
    };
    addMessage(activeSessionId, userMsg);
    await db.saveMessage(activeSessionId, userMsg).catch(() => {});

    const session = useChatStore.getState().sessions.find((s) => s.id === activeSessionId);
    if (!session) return;

    const apiMessages = session.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    await doSend(activeSessionId, apiMessages);
  }, [text, activeSessionId, isStreaming, serverStatus.running, addMessage, doSend]);

  /** Stop the currently streaming model response. */
  const handleStop = useCallback(async () => {
    try {
      await geniex.cancelChatCompletion();
    } catch (err) {
      console.error("Failed to stop generation:", err);
    }
  }, []);

  /** Handle retry. */
  useEffect(() => {
    if (!retryFromMessageId || !activeSessionId || isStreaming) return;

    const store = useChatStore.getState();
    const session = store.sessions.find((s) => s.id === activeSessionId);
    if (!session) {
      setRetryFromMessageId(null);
      return;
    }

    const idx = session.messages.findIndex((m) => m.id === retryFromMessageId);
    if (idx < 0) {
      setRetryFromMessageId(null);
      return;
    }

    // Collect all messages after the retry point for DB cleanup
    const messagesToRemove = session.messages.slice(idx + 1);
    if (messagesToRemove.length > 0) {
      store.removeMessagesAfter(activeSessionId, retryFromMessageId);
      for (const msg of messagesToRemove) {
        if (msg.isError) db.deleteChatError(msg.id).catch(() => {});
        else db.deleteMessage(msg.id).catch(() => {});
      }
    }

    const updated = useChatStore.getState().sessions.find((s) => s.id === activeSessionId);
    if (!updated) {
      setRetryFromMessageId(null);
      return;
    }

    const apiMessages = updated.messages
      .slice(0, idx + 1)
      .map((m) => ({ role: m.role as "user" | "assistant" | "system", content: m.content }));

    setRetryFromMessageId(null);
    void doSend(activeSessionId, apiMessages);
  }, [retryFromMessageId, activeSessionId, isStreaming, doSend, setRetryFromMessageId]);

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

  const isDisabled = !text.trim() || isStreaming || !serverStatus.running;

  return (
    <div className="chat-input__area">
      <div className="chat-input__wrapper">
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
