import { Caption1, Spinner } from "@fluentui/react-components";
import { useEffect, useRef } from "react";
import { useChatStore } from "../../stores/chatStore";
import type { Message } from "../../types";
import { coveredMessageIds } from "../../utils/compaction";
import { isNearBottom } from "../../utils/scroll";
import { isSystemEvent } from "../../utils/systemEvents";
import { parseThinking } from "../../utils/thinking";
import MessageBubble from "../MessageBubble/MessageBubble";
import SystemEventLine from "../SystemEventLine/SystemEventLine";
import "./ChatArea.css";

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
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const compacting = useChatStore((s) => s.compacting);
  const bottomRef = useRef<HTMLDivElement>(null);

  const session = sessions.find((s) => s.id === activeSessionId);

  // Reply text grows in place while streaming, so the last message's length is also a trigger.
  const lastMessage = session?.messages[session.messages.length - 1];
  const lastMessageLength = lastMessage?.content.length ?? 0;

  // Whether the view follows new text. It stops when the user scrolls up and resumes when they
  // scroll back to the bottom, send a message, or open another conversation.
  const followRef = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: opening another conversation is the trigger
  useEffect(() => {
    followRef.current = true;
  }, [activeSessionId]);

  // Scroll to the bottom on new messages and while a reply streams in, unless the user scrolled up.
  // The scroll is instant: smooth scrolling falls behind fast token output.
  // biome-ignore lint/correctness/useExhaustiveDependencies: message length is the intended trigger, not array identity
  useEffect(() => {
    if (lastMessage?.role === "user") followRef.current = true;
    if (followRef.current) bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [session?.messages.length, lastMessageLength, isStreaming, compacting]);

  if (!session) return null;

  // A summary runs before the send, so it is shown in place of the streaming status.
  const statusLabel = compacting
    ? "Summarising the conversation…"
    : streamingStatus(session.messages, isStreaming);
  // Messages a summary stands in for: they cannot be deleted or retried.
  const coveredIds = coveredMessageIds(session.messages);

  // Compute last user message ID once (avoids repeated .filter().slice() per bubble)
  let lastUserMsgId: string | undefined;
  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i].role === "user") {
      lastUserMsgId = session.messages[i].id;
      break;
    }
  }

  /** Build the message list. System lines (such as a model change) are drawn as lines, not bubbles. */
  const renderedMessages: React.ReactNode[] = [];

  const lastMsgId = session.messages[session.messages.length - 1]?.id;

  for (const msg of session.messages) {
    if (isSystemEvent(msg)) {
      renderedMessages.push(<SystemEventLine key={msg.id} message={msg} />);
      continue;
    }

    renderedMessages.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isLastUserMessage={msg.role === "user" && msg.id === lastUserMsgId}
        isStreaming={isStreaming}
        isLive={isStreaming && msg.id === lastMsgId}
        isCovered={coveredIds.has(msg.id)}
      />,
    );
  }

  return (
    <div
      className="chat-area__area"
      onScroll={(e) => {
        followRef.current = isNearBottom(e.currentTarget);
      }}
    >
      <div className="chat-area__messages">
        {renderedMessages}

        {statusLabel && (
          <div className="chat-area__typing">
            <Spinner size="tiny" />
            <Caption1>{statusLabel}</Caption1>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
