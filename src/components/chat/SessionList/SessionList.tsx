import { Button, Caption1, makeStyles, tokens } from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    width: "260px",
    flexShrink: 0,
    minHeight: 0,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  newButton: {
    margin: tokens.spacingHorizontalM,
  },
  list: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    padding: `0 ${tokens.spacingHorizontalS} ${tokens.spacingVerticalS}`,
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  itemText: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-start",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: {
    padding: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground3,
  },
});

/** Sidebar list of chat sessions with create + delete actions. */
export function SessionList() {
  const styles = useStyles();
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const navigate = useNavigate();
  const createSession = useChatStore((s) => s.createSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const handleDelete = async (id: string) => {
    deleteSession(id);
    if (id === activeSessionId) navigate("/chat");
    await db.deleteSession(id).catch(() => {});
  };

  return (
    <aside className={styles.root}>
      <Button
        appearance="primary"
        size="small"
        icon={<AddRegular />}
        className={styles.newButton}
        onClick={() => {
          navigate(`/chat/${createSession()}`);
        }}
      >
        New Conversation
      </Button>

      <div className={styles.list}>
        {sessions.map((session) => (
          <div key={session.id} className={styles.item}>
            <Button
              appearance={session.id === activeSessionId ? "outline" : "subtle"}
              size="small"
              className={styles.itemText}
              aria-current={session.id === activeSessionId ? "true" : undefined}
              onClick={() => navigate(`/chat/${session.id}`)}
            >
              {session.title}
            </Button>
            <Button
              appearance="subtle"
              size="small"
              icon={<DeleteRegular />}
              title="Delete conversation"
              aria-label={`Delete ${session.title}`}
              onClick={() => void handleDelete(session.id)}
            />
          </div>
        ))}
        {sessions.length === 0 && (
          <Caption1 className={styles.empty}>No conversations yet.</Caption1>
        )}
      </div>
    </aside>
  );
}
