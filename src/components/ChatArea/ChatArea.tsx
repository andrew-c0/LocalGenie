import { useChatStore } from "../../stores/chatStore";
import MessageList from "../chat/MessageList/MessageList";

/** The open conversation's messages. The list itself is shared with the Dispatch task transcript. */
export default function ChatArea() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const compacting = useChatStore((s) => s.compacting);

  const session = sessions.find((s) => s.id === activeSessionId);
  if (!session) return null;

  return (
    <MessageList
      viewKey={session.id}
      messages={session.messages}
      isStreaming={isStreaming}
      compacting={compacting}
      className="conversation-canvas__transcript"
    />
  );
}
