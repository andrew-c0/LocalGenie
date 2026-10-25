import { Button } from "@fluentui/react-components";
import { type ReactNode, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatArea from "../../components/ChatArea/ChatArea";
import ChatInput from "../../components/ChatInput/ChatInput";
import { ChatContextHeader } from "../../components/chat/ChatContextHeader/ChatContextHeader";
import { ChatWelcome } from "../../components/chat/ChatWelcome/ChatWelcome";
import MissingFileBanner from "../../components/chat/MissingFileBanner/MissingFileBanner";
import { SessionList } from "../../components/chat/SessionList/SessionList";
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
  const createSession = useChatStore((s) => s.createSession);
  const discardEmptySessions = useChatStore((s) => s.discardEmptySessions);
  const sessions = useChatStore((s) => s.sessions);
  const serverStatus = useModelStore((s) => s.serverStatus);

  // Sessions may still be loading when the page opens, so a missing id is shown, not redirected.
  const activeSession = sessions.find((s) => s.id === sessionId);

  // An empty conversation is a draft: it goes once the user moves on without sending anything.
  useEffect(() => {
    setActiveSession(sessionId ?? null);
    discardEmptySessions(sessionId ?? null);
  }, [sessionId, setActiveSession, discardEmptySessions]);

  useEffect(() => () => discardEmptySessions(null), [discardEmptySessions]);

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
    const recentSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
    content = (
      <ChatWelcome
        serverRunning={serverStatus.running}
        modelCount={serverStatus.models.length}
        recentSessions={recentSessions}
        onNewConversation={() => navigate(`/chat/${createSession()}`)}
        onOpenSession={(id) => navigate(`/chat/${id}`)}
      />
    );
  }

  return (
    <div className="chat-page__page">
      <SessionList />

      <div className="chat-page__canvas">
        <ChatContextHeader />
        {content}
      </div>
    </div>
  );
}
