import { useChatStore } from "../../stores/chatStore";
import { streamBelongsTo, summaryBelongsTo } from "../../utils/streamOwner";
import MessageList from "../chat/MessageList/MessageList";

/** The open conversation's messages. The list itself is shared with the Dispatch task transcript. */
export default function ChatArea() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const compacting = useChatStore((s) => s.compacting);
  const activeStream = useChatStore((s) => s.activeStream);
  const compactingSessionId = useChatStore((s) => s.compactingSessionId);

  const session = sessions.find((s) => s.id === activeSessionId);
  if (!session) return null;

  return (
    <MessageList
      viewKey={session.id}
      messages={session.messages}
      isStreaming={isStreaming}
      compacting={compacting}
      replyOwned={streamBelongsTo(activeStream, session.id)}
      summaryOwned={summaryBelongsTo(compactingSessionId, session.id)}
      className="conversation-canvas__transcript"
    />
  );
}
