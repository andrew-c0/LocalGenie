import { Avatar, Body1, Button, Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { ArrowReplyRegular } from "@fluentui/react-icons";
import { useChatStore } from "../stores/chatStore";
import type { Message } from "../types";
import { formatDuration, formatTokPerSec } from "../utils/format";
import { MarkdownContent } from "./ui/MarkdownContent/MarkdownContent";

const useStyles = makeStyles({
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: tokens.spacingHorizontalS,
  },
  rowUser: {
    flexDirection: "row-reverse",
  },
  bubble: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    maxWidth: "80%",
    minWidth: 0,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  bubbleUser: {
    backgroundColor: tokens.colorNeutralBackground3,
  },
  pre: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  stats: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
  },
});

interface MessageBubbleProps {
  message: Message;
  isLastUserMessage?: boolean;
  isStreaming?: boolean;
}

export default function MessageBubble({
  message,
  isLastUserMessage = false,
  isStreaming = false,
}: MessageBubbleProps) {
  const styles = useStyles();
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const setRetryFromMessageId = useChatStore((s) => s.setRetryFromMessageId);

  const showRetry = isUser && isLastUserMessage && !isStreaming && message.content.trim();

  const stats = isAssistant ? message.stats : undefined;

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : ""}`}>
      <Avatar name={isUser ? "User" : "AI"} size={32} color={isUser ? "neutral" : "brand"} />
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : ""}`}>
        {isUser ? (
          <Body1 className={styles.pre}>{message.content}</Body1>
        ) : (
          <MarkdownContent>{message.content || ""}</MarkdownContent>
        )}

        {isAssistant && stats && (
          <div className={styles.stats}>
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
          <Button
            type="button"
            appearance="primary"
            size="small"
            icon={<ArrowReplyRegular />}
            onClick={() => setRetryFromMessageId(message.id)}
            title="Regenerate response"
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
