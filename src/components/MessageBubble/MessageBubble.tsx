import { Avatar, Body1, Button, Caption1 } from "@fluentui/react-components";
import { ArrowReplyRegular } from "@fluentui/react-icons";
import { useChatStore } from "../../stores/chatStore";
import type { Message } from "../../types";
import { formatDuration, formatTokPerSec } from "../../utils/format";
import { parseThinking } from "../../utils/thinking";
import { ThinkingBlock } from "../chat/ThinkingBlock/ThinkingBlock";
import { Flex } from "../ui/Flex/Flex";
import { MarkdownContent } from "../ui/MarkdownContent/MarkdownContent";
import "./MessageBubble.css";

interface MessageBubbleProps {
  message: Message;
  isLastUserMessage?: boolean;
  isStreaming?: boolean;
  /** True for the reply that is being streamed right now. */
  isLive?: boolean;
}

export default function MessageBubble({
  message,
  isLastUserMessage = false,
  isStreaming = false,
  isLive = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const setRetryFromMessageId = useChatStore((s) => s.setRetryFromMessageId);

  const showRetry = isUser && isLastUserMessage && !isStreaming && message.content.trim();

  const stats = isAssistant ? message.stats : undefined;
  const reply = isAssistant ? parseThinking(message.content) : null;

  return (
    <div className={`${"message-bubble__row"} ${isUser ? "message-bubble__row-user" : ""}`}>
      <Avatar name={isUser ? "User" : "AI"} size={32} color={isUser ? "neutral" : "brand"} />
      <div className={`${"message-bubble__bubble"} ${isUser ? "message-bubble__bubble-user" : ""}`}>
        {isUser && <Body1 className="message-bubble__pre">{message.content}</Body1>}
        {reply && (reply.thinking || reply.thinkingOpen) && (
          <ThinkingBlock text={reply.thinking} live={isLive && reply.thinkingOpen} />
        )}
        {reply?.answer && <MarkdownContent>{reply.answer}</MarkdownContent>}

        {isAssistant && message.finishReason === "length" && (
          <Caption1 className="message-bubble__notice">
            Stopped: the model reached its length limit.
          </Caption1>
        )}

        {isAssistant && stats && (
          <div className="message-bubble__stats">
            <Caption1 title="Time to first token">
              ⏱ {formatDuration(stats.timeToFirstToken)}
            </Caption1>
            <Caption1 title="Total generation time">⚡ {formatDuration(stats.totalTime)}</Caption1>
            <Caption1 title="Token count">🪙 {stats.tokenCount} tokens</Caption1>
            <Caption1 title="Tokens per second">
              🚀 {formatTokPerSec(stats.tokenCount, stats.totalTime)} tok/s
            </Caption1>
            <Caption1 title="Input characters">📝 {stats.promptChars} chars</Caption1>
          </div>
        )}

        {showRetry && (
          <Flex>
            <Button
              type="button"
              appearance="primary"
              icon={<ArrowReplyRegular />}
              onClick={() => setRetryFromMessageId(message.id)}
              title="Regenerate response"
            >
              Retry
            </Button>
          </Flex>
        )}
      </div>
    </div>
  );
}
