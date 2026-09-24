import { SendRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import * as db from "../services/database";
import * as geniex from "../services/geniex";
import { useChatStore } from "../stores/chatStore";
import { defaultSettings, useModelStore } from "../stores/modelStore";
import type { Message } from "../types";

export default function ChatInput() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const addMessage = useChatStore((s) => s.addMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setLastSendTime = useChatStore((s) => s.setLastSendTime);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const serverPort = useModelStore((s) => s.serverPort);
  const retryFromMessageId = useChatStore((s) => s.retryFromMessageId);
  const setRetryFromMessageId = useChatStore((s) => s.setRetryFromMessageId);

  const activeSession = useChatStore((s) =>
    s.sessions.find((sess) => sess.id === s.activeSessionId),
  );

  /** Core send logic — uses activeModelId from the model store. */
  const doSend = useCallback(
    async (
      sessionId: string,
      apiMessages: { role: "user" | "assistant" | "system"; content: string }[],
    ) => {
      setStreaming(true);
      setLastSendTime(Date.now());

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
        const baseUrl = `http://127.0.0.1:${serverPort}`;
        await geniex.chatCompletion(apiMessages, settings, rawModelId ?? undefined, baseUrl);
      } catch (err) {
        console.error("Chat completion failed:", err);
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ Error: ${String(err)}`,
          timestamp: Date.now(),
        };
        addMessage(sessionId, errorMsg);
        setStreaming(false);
      }
    },
    [addMessage, setStreaming, setLastSendTime, serverPort],
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
        db.deleteMessage(msg.id).catch(() => {});
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

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  const isDisabled = !text.trim() || isStreaming || !serverStatus.running;

  return (
    <div className="chat-input-area">
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          className="chat-input-field"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            serverStatus.running
              ? "Type a message… (Shift+Enter for new line)"
              : "Start the GenieX server to chat"
          }
          rows={1}
          disabled={isStreaming}
        />
        <button
          type="button"
          className={`send-button${isDisabled ? " send-button-disabled" : ""}`}
          onClick={handleSend}
          disabled={isDisabled}
        >
          <SendRegular />
        </button>
      </div>
    </div>
  );
}
