import { Caption1, Divider, makeStyles, Spinner, tokens } from "@fluentui/react-components";
import { useEffect, useRef } from "react";
import { useChatStore } from "../stores/chatStore";
import type { Message } from "../types";
import { parseThinking } from "../utils/thinking";
import MessageBubble from "./MessageBubble";

const useStyles = makeStyles({
  area: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: tokens.spacingHorizontalL,
  },
  messages: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    maxWidth: "840px",
    margin: "0 auto",
  },
  delimiter: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  delimiterLine: {
    flex: 1,
  },
  typing: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * What the model is doing before its visible answer starts. Derived from the streamed text:
 * no reply yet → prefill; an open thinking block → its own panel shows progress (null here);
 * no answer text yet → outputting. Returns null once visible answer text exists.
 */
function streamingStatus(messages: Message[], isStreaming: boolean): string | null {
  if (!isStreaming) return null;
  const last = messages[messages.length - 1];
  if (last?.role !== "assistant") return "Prefilling prompt…";
  const reply = parseThinking(last.content);
  if (reply.thinkingOpen) return null;
  return reply.answer ? null : "Outputting…";
}

export default function ChatArea() {
  const styles = useStyles();
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const bottomRef = useRef<HTMLDivElement>(null);

  const session = sessions.find((s) => s.id === activeSessionId);

  // Auto-scroll to bottom on new messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: message length is the intended trigger, not array identity
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, isStreaming]);

  if (!session) return null;

  const statusLabel = streamingStatus(session.messages, isStreaming);

  // Compute last user message ID once (avoids repeated .filter().slice() per bubble)
  let lastUserMsgId: string | undefined;
  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i].role === "user") {
      lastUserMsgId = session.messages[i].id;
      break;
    }
  }

  /** Build message list with model delimiters inserted when modelId changes. */
  const renderedMessages: React.ReactNode[] = [];
  let prevModelId: string | undefined;

  const lastMsgId = session.messages[session.messages.length - 1]?.id;

  for (const msg of session.messages) {
    // Show delimiter when the assistant's model changes
    if (msg.role === "assistant" && msg.modelId && msg.modelId !== prevModelId) {
      const shortName = msg.modelId.split("/").pop() ?? msg.modelId;
      renderedMessages.push(
        <div key={`delimiter-${msg.id}`} className={styles.delimiter}>
          <Divider className={styles.delimiterLine} />
          <Caption1>{shortName}</Caption1>
          <Divider className={styles.delimiterLine} />
        </div>,
      );
    }
    if (msg.modelId) prevModelId = msg.modelId;

    renderedMessages.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isLastUserMessage={msg.role === "user" && msg.id === lastUserMsgId}
        isStreaming={isStreaming}
        isLive={isStreaming && msg.id === lastMsgId}
      />,
    );
  }

  return (
    <div className={styles.area}>
      <div className={styles.messages}>
        {renderedMessages}

        {statusLabel && (
          <div className={styles.typing}>
            <Spinner size="tiny" />
            <Caption1>{statusLabel}</Caption1>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
