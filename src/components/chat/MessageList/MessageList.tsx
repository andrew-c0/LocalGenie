import { Caption1, Spinner } from "@fluentui/react-components";
import { useFollowBottom } from "../../../hooks/useFollowBottom";
import type { Message } from "../../../types";
import { coveredMessageIds } from "../../../utils/compaction";
import { streamingStatusLabel } from "../../../utils/streamingStatus";
import { isSystemEvent } from "../../../utils/systemEvents";
import { isToolMessage } from "../../../utils/toolRecords";
import MessageBubble from "../../MessageBubble/MessageBubble";
import SystemEventLine from "../../SystemEventLine/SystemEventLine";
import ToolCallLine from "../../ToolCallLine/ToolCallLine";
import "./MessageList.css";

export interface MessageListProps {
  /** Names the view. A new value (another conversation or task) starts at the newest message. */
  viewKey: string;
  messages: Message[];
  /** A reply is streaming in any conversation. It locks the message field and the message actions. */
  isStreaming: boolean;
  /** A summary is being written in any conversation. */
  compacting?: boolean;
  /** The streaming reply is this conversation's. Only then the status line reads the stream. */
  replyOwned: boolean;
  /** The running summary is this conversation's. Only then the status line reads the summary. */
  summaryOwned: boolean;
  /** No retry or delete on the messages (a Dispatch task's transcript). */
  readOnly?: boolean;
  /** The messages are a Dispatch conversation's transcript. */
  inDispatch?: boolean;
  /** Class of the scrolling container. The parent sizes and scrolls it. */
  className?: string;
}

/**
 * The messages of one conversation or task, in order, with the status line while a reply or summary runs.
 * System lines and tool calls are drawn as lines, the rest as bubbles. The view follows new messages while
 * the user is at the bottom. Shared by the chat and the Dispatch task transcript.
 */
export default function MessageList({
  viewKey,
  messages,
  isStreaming,
  compacting = false,
  replyOwned,
  summaryOwned,
  readOnly = false,
  inDispatch = false,
  className,
}: MessageListProps) {
  const last = messages[messages.length - 1];
  const lastLength = last?.content.length ?? 0;
  // Reply text grows in place while streaming, so the last message's length is also a trigger.
  const { bottomRef, onScroll } = useFollowBottom(
    viewKey,
    [messages.length, lastLength, isStreaming, compacting],
    last?.role === "user",
  );

  // The status line reads the reply and the summary of this conversation only; another one's work is not shown here.
  const statusLabel = streamingStatusLabel(
    messages,
    isStreaming && replyOwned,
    compacting && summaryOwned,
  );
  // Messages a summary stands in for: they cannot be deleted or retried.
  const coveredIds = coveredMessageIds(messages);
  const lastUserMsgId = findLast(messages, (message) => message.role === "user")?.id;
  const lastMsgId = last?.id;

  return (
    <div className={className} onScroll={onScroll}>
      <div className="message-list__items">
        {messages.map((msg) => {
          if (isSystemEvent(msg)) return <SystemEventLine key={msg.id} message={msg} />;
          if (isToolMessage(msg))
            return <ToolCallLine key={msg.id} message={msg} inDispatch={inDispatch} />;
          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLastUserMessage={msg.role === "user" && msg.id === lastUserMsgId}
              isStreaming={isStreaming}
              isLive={isStreaming && msg.id === lastMsgId}
              isCovered={coveredIds.has(msg.id)}
              readOnly={readOnly}
            />
          );
        })}

        {statusLabel && (
          <div className="message-list__status">
            <Spinner size="tiny" />
            <Caption1>{statusLabel}</Caption1>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/** The last item that matches, or undefined. */
function findLast<T>(items: readonly T[], matches: (item: T) => boolean): T | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    if (matches(items[i])) return items[i];
  }
  return undefined;
}
