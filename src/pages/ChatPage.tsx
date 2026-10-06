import ChatArea from "../components/ChatArea";
import ChatInput from "../components/ChatInput";
import { ChatContextHeader } from "../components/chat/ChatContextHeader/ChatContextHeader";
import { SessionList } from "../components/chat/SessionList/SessionList";
import { StateBlock } from "../components/ui/primitives";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";

/** Full chat workspace: session list + context header + thread + composer. */
export default function ChatPage() {
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const serverStatus = useModelStore((s) => s.serverStatus);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="lx-chatpage">
      <SessionList />

      {/* -- Conversation canvas -- */}
      <div className="lx-chat-canvas">
        <ChatContextHeader />

        {/* Thread + composer, or empty state */}
        {activeSession ? (
          <>
            <ChatArea />
            <ChatInput />
          </>
        ) : (
          <StateBlock
            icon="💬"
            message={
              serverStatus.running
                ? "Select or create a conversation to start chatting."
                : "Start the GenieX server to begin chatting with your loaded models."
            }
          />
        )}
      </div>
    </div>
  );
}
