import { ArrowReplyRegular } from "@fluentui/react-icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useChatStore } from "../stores/chatStore";
import type { Message } from "../types";

interface MessageBubbleProps {
  message: Message;
  isLastUserMessage?: boolean;
  isStreaming?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokPerSec(tokenCount: number, ms: number): string {
  if (ms === 0 || tokenCount === 0) return "—";
  const sec = ms / 1000;
  return `${(tokenCount / sec).toFixed(1)}`;
}

export default function MessageBubble({
  message,
  isLastUserMessage = false,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const setRetryFromMessageId = useChatStore((s) => s.setRetryFromMessageId);

  const showRetry = isUser && isLastUserMessage && !isStreaming && message.content.trim();

  const stats = isAssistant ? message.stats : undefined;

  return (
    <div className="message-row">
      <div className={`message-avatar ${message.role}`}>{isUser ? "U" : "AI"}</div>
      <div className={`message-bubble ${message.role}`}>
        {isUser ? (
          <div className="message-content">{message.content}</div>
        ) : (
          <div className="message-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || ""}</ReactMarkdown>
          </div>
        )}

        {/* Generation stats (assistant messages only) */}
        {isAssistant && stats && (
          <div className="message-stats">
            <span title="Time to first token">⏱ {formatDuration(stats.timeToFirstToken)}</span>
            <span title="Total generation time">⚡ {formatDuration(stats.totalTime)}</span>
            <span title="Token count">🪙 {stats.tokenCount} tokens</span>
            <span title="Tokens per second">
              🚀 {formatTokPerSec(stats.tokenCount, stats.totalTime)} tok/s
            </span>
            <span title="Input characters">📝 {stats.promptChars} chars</span>
          </div>
        )}

        {/* Retry button (last user message only) */}
        {showRetry && (
          <button
            type="button"
            className="retry-button"
            onClick={() => setRetryFromMessageId(message.id)}
            title="Regenerate response"
          >
            <ArrowReplyRegular />
            <span>Retry</span>
          </button>
        )}
      </div>
    </div>
  );
}
