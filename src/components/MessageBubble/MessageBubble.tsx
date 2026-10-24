import { Avatar, Body1, Button, Caption1 } from "@fluentui/react-components";
import { ArrowReplyRegular, DeleteRegular } from "@fluentui/react-icons";
import { useState } from "react";
import * as db from "../../services/database";
import { useChatStore } from "../../stores/chatStore";
import type { Message } from "../../types";
import { formatDuration, formatTokPerSec } from "../../utils/format";
import { parseThinking } from "../../utils/thinking";
import { AttachmentList } from "../chat/AttachmentList/AttachmentList";
import { ThinkingBlock } from "../chat/ThinkingBlock/ThinkingBlock";
import { ConfirmDialog } from "../ui/ConfirmDialog/ConfirmDialog";
import { MarkdownContent } from "../ui/MarkdownContent/MarkdownContent";
import "./MessageBubble.css";

/**
 * Removes a message and every message after it, from the chat and the database. Its files then
 * stop being sent with later turns.
 */
function removeFrom(sessionId: string, messageId: string) {
  const store = useChatStore.getState();
  const session = store.sessions.find((s) => s.id === sessionId);
  const idx = session?.messages.findIndex((m) => m.id === messageId) ?? -1;
  if (!session || idx < 0) return;

  const removed = session.messages.slice(idx);
  store.removeMessagesFrom(sessionId, messageId);
  for (const msg of removed) {
    if (msg.isError) db.deleteChatError(msg.id).catch(() => {});
    else db.deleteMessage(msg.id).catch(() => {});
  }
}

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
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const hasAttachments = (message.attachments?.length ?? 0) > 0;
  // Every message is sent to the model on later turns, so any of them can be removed with the ones after it.
  const showDelete = !isStreaming;
  // Files saved before paths were kept cannot be read again, so their message cannot be retried.
  const filesCanBeResent = (message.attachments ?? []).every((file) => !!file.path);
  const showRetry =
    isUser &&
    isLastUserMessage &&
    !isStreaming &&
    filesCanBeResent &&
    (message.content.trim() || hasAttachments);

  const stats = isAssistant ? message.stats : undefined;
  const reply = isAssistant ? parseThinking(message.content) : null;

  return (
    <div className={`${"message-bubble__row"} ${isUser ? "message-bubble__row-user" : ""}`}>
      <Avatar name={isUser ? "User" : "AI"} size={32} color={isUser ? "neutral" : "brand"} />
      <div className={`${"message-bubble__bubble"} ${isUser ? "message-bubble__bubble-user" : ""}`}>
        {isUser && hasAttachments && <AttachmentList attachments={message.attachments ?? []} />}
        {isUser && message.content && (
          <Body1 className="message-bubble__pre">{message.content}</Body1>
        )}
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
      </div>

      {/* Actions sit outside the bubble and show when the message is hovered or focused. */}
      {(showRetry || showDelete) && (
        <div className="message-bubble__actions">
          {showRetry && (
            <Button
              type="button"
              appearance="subtle"
              size="small"
              icon={<ArrowReplyRegular />}
              onClick={() => setRetryFromMessageId(message.id)}
              title="Regenerate response"
              aria-label="Regenerate response"
            />
          )}
          {showDelete && (
            <Button
              type="button"
              appearance="subtle"
              size="small"
              icon={<DeleteRegular />}
              onClick={() => setConfirmingDelete(true)}
              title="Delete this message and every message after it"
              aria-label="Delete this message and every message after it"
            />
          )}
        </div>
      )}
      {confirmingDelete && activeSessionId && (
        <ConfirmDialog
          title="Delete this message?"
          message="This message and every message after it are removed from the chat. The model will no longer see them. This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            setConfirmingDelete(false);
            removeFrom(activeSessionId, message.id);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
