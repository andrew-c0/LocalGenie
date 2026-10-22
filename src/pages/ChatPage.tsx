import { Button, makeStyles, tokens } from "@fluentui/react-components";
import { type ReactNode, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ChatArea from "../components/ChatArea";
import ChatInput from "../components/ChatInput";
import { ChatContextHeader } from "../components/chat/ChatContextHeader/ChatContextHeader";
import { SessionList } from "../components/chat/SessionList/SessionList";
import { StateBlock } from "../components/ui/StateBlock/StateBlock";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";

const useStyles = makeStyles({
  page: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },
  canvas: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  empty: {
    flex: 1,
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * Chat workspace. `/chat` shows the default content; `/chat/:sessionId` opens that conversation.
 * The URL is the source of truth: the store's active session follows it.
 */
export default function ChatPage() {
  const styles = useStyles();
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
        <ChatInput />
      </>
    );
  } else if (sessionId) {
    content = (
      <div className={styles.empty}>
        <StateBlock icon="🔎" message="This conversation no longer exists.">
          <Button appearance="secondary" size="small" onClick={() => navigate("/chat")}>
            Back to chats
          </Button>
        </StateBlock>
      </div>
    );
  } else {
    content = (
      <div className={styles.empty}>
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
    <div className={styles.page}>
      <SessionList />

      <div className={styles.canvas}>
        <ChatContextHeader />
        {content}
      </div>
    </div>
  );
}
