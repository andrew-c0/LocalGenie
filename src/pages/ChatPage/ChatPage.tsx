import { Button } from "@fluentui/react-components";
import { type ReactNode, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatArea from "../../components/ChatArea/ChatArea";
import ChatInput from "../../components/ChatInput/ChatInput";
import { ChatContextHeader } from "../../components/chat/ChatContextHeader/ChatContextHeader";
import MissingFileBanner from "../../components/chat/MissingFileBanner/MissingFileBanner";
import { SessionList } from "../../components/chat/SessionList/SessionList";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { useChatStore } from "../../stores/chatStore";
import { useModelStore } from "../../stores/modelStore";
import "./ChatPage.css";

/**
 * Chat workspace. `/chat` shows the default content; `/chat/:sessionId` opens that conversation.
 * The URL is the source of truth: the store's active session follows it.
 */
export default function ChatPage() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const sessions = useChatStore((s) => s.sessions);
  const serverStatus = useModelStore((s) => s.serverStatus);

  // Sessions may still be loading when the page opens, so a missing id is shown, not redirected.
  const activeSession = sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    setActiveSession(sessionId ?? null);
  }, [sessionId, setActiveSession]);

  let content: ReactNode;
  if (activeSession) {
    content = (
      <>
        <ChatArea />
        {activeSession.messages.length === 0 && <MissingFileBanner />}
        <ChatInput />
      </>
    );
  } else if (sessionId) {
    content = (
      <div className="chat-page__empty">
        <StateBlock icon="🔎" message="This conversation no longer exists.">
          <Button appearance="secondary" onClick={() => navigate("/chat")}>
            Back to chats
          </Button>
        </StateBlock>
      </div>
    );
  } else {
    content = (
      <div className="chat-page__empty">
        <StateBlock
          icon="💬"
          message={
            serverStatus.running
              ? "Select or create a conversation to start chatting."
              : "Start the GenieX server to begin chatting with your loaded models."
          }
        />
      </div>
    );
  }

  return (
    <div className="chat-page__page">
      <SessionList />

      <div className="chat-page__canvas">
        {/* An open conversation shows its title in the context bar instead. */}
        {!activeSession && (
          <PageHeader
            eyebrow="● CHAT"
            title="Chat"
            subtitle="Chat with your loaded models. Conversations are stored on this device."
          />
        )}
        <ChatContextHeader />
        {content}
      </div>
    </div>
  );
}
