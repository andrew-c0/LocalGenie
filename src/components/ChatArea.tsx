import { useEffect, useRef } from "react";
import { useChatStore } from "../stores/chatStore";
import MessageBubble from "./MessageBubble";

export default function ChatArea() {
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

  const lastMsg = session.messages[session.messages.length - 1];
  const showTypingIndicator = isStreaming && (!lastMsg || lastMsg.role === "user");

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

  for (const msg of session.messages) {
    // Show delimiter when the assistant's model changes
    if (msg.role === "assistant" && msg.modelId && msg.modelId !== prevModelId) {
      const shortName = msg.modelId.split("/").pop() ?? msg.modelId;
      renderedMessages.push(
        <div key={`delimiter-${msg.id}`} className="model-delimiter">
          <span className="model-delimiter-line" />
          <span className="model-delimiter-label">{shortName}</span>
          <span className="model-delimiter-line" />
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
      />,
    );
  }

  return (
    <div className="chat-area">
      <div className="chat-messages">
        {renderedMessages}

        {showTypingIndicator && (
          <div className="message-row assistant">
            <div className="message-avatar assistant">AI</div>
            <div className="message-bubble assistant">
              <div className="typing-indicator">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
