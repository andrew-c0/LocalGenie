import { type ReactNode, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatArea from "../../components/ChatArea/ChatArea";
import ChatInput from "../../components/ChatInput/ChatInput";
import { ChatHeaderActions } from "../../components/chat/ChatHeaderActions/ChatHeaderActions";
import { ChatWelcome } from "../../components/chat/ChatWelcome/ChatWelcome";
import MissingFileBanner from "../../components/chat/MissingFileBanner/MissingFileBanner";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { useBreadcrumbLabel } from "../../navigation/useBreadcrumbLabel";
import { useChatStore } from "../../stores/chatStore";
import { useModelStore } from "../../stores/modelStore";
import "./ChatPage.css";

/** The breadcrumb text while the conversation's title is not known: it is missing, or still loading. */
const UNKNOWN_CONVERSATION_LABEL = "Conversation";

/**
 * Chat workspace. `/chat` shows the welcome content; `/chat/:sessionId` opens that conversation.
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

  // The last breadcrumb is the conversation's title, so a renamed chat updates the trail.
  useBreadcrumbLabel(
    sessionId === undefined ? null : (activeSession?.title ?? UNKNOWN_CONVERSATION_LABEL),
  );

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
    // The breadcrumb's "Chat" crumb leads back to the landing, so no button is needed here.
    content = (
      <div className="chat-page__empty">
        <StateBlock icon="🔎" message="This conversation no longer exists." />
      </div>
    );
  } else {
    content = (
      <ChatWelcome
        serverRunning={serverStatus.running}
        modelCount={serverStatus.models.length}
        onNewConversation={() => navigate(`/chat/${createSession()}`)}
      />
    );
  }

  return (
    <div className="chat-page__canvas">
      {activeSession && <ChatHeaderActions session={activeSession} />}
      {content}
    </div>
  );
}
