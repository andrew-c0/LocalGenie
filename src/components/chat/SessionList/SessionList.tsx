import { Button, Caption1, makeStyles, tokens } from "@fluentui/react-components";
import {
  AddRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DeleteRegular,
} from "@fluentui/react-icons";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";

const EXPANDED_WIDTH = "260px";
const COLLAPSED_WIDTH = "52px";

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    flexShrink: 0,
    minHeight: 0,
    padding: tokens.spacingHorizontalS,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  rootExpanded: {
    width: EXPANDED_WIDTH,
  },
  rootCollapsed: {
    width: COLLAPSED_WIDTH,
    alignItems: "center",
  },
  header: {
    display: "flex",
    justifyContent: "flex-end",
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
    padding: tokens.spacingVerticalXXS,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    cursor: "pointer",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground3,
    },
  },
  rowActive: {
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  title: {
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

/** Sidebar list of chat sessions. Collapsible; New Conversation sits at the bottom. */
export function SessionList() {
  const styles = useStyles();
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const navigate = useNavigate();
  const createSession = useChatStore((s) => s.createSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const [collapsed, setCollapsed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const pendingSession = sessions.find((s) => s.id === pendingDelete);

  const handleDelete = async (id: string) => {
    setPendingDelete(null);
    deleteSession(id);
    if (id === activeSessionId) navigate("/chat");
    await db.deleteSession(id).catch(() => {});
  };

  const toggle = (
    <Button
      appearance="subtle"
      icon={collapsed ? <ChevronRightRegular /> : <ChevronLeftRegular />}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand conversations" : "Collapse conversations"}
      title={collapsed ? "Expand conversations" : "Collapse conversations"}
      onClick={() => setCollapsed((v) => !v)}
    />
  );

  const newConversation = (
    <Button
      appearance="primary"
      icon={<AddRegular />}
      aria-label="New conversation"
      title="New conversation"
      onClick={() => navigate(`/chat/${createSession()}`)}
    >
      {collapsed ? null : "New Conversation"}
    </Button>
  );

  return (
    <aside className={`${styles.root} ${collapsed ? styles.rootCollapsed : styles.rootExpanded}`}>
      <div className={styles.header}>{toggle}</div>

      {!collapsed && (
        <div className={styles.list}>
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <div key={session.id} className={`${styles.row} ${isActive ? styles.rowActive : ""}`}>
                <Button
                  appearance="transparent"
                  className={styles.title}
                  onClick={() => navigate(`/chat/${session.id}`)}
                  aria-current={isActive ? "true" : undefined}
                  title={session.title}
                >
                  {session.title}
                </Button>
                {isActive && (
                  <Button
                    appearance="subtle"
                    icon={<DeleteRegular />}
                    title="Delete conversation"
                    aria-label={`Delete ${session.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(session.id);
                    }}
                  />
                )}
              </div>
            );
          })}
          {sessions.length === 0 && (
            <Caption1 className={styles.empty}>No conversations yet.</Caption1>
          )}
        </div>
      )}

      {collapsed && <div className={styles.list} />}

      {newConversation}

      {pendingSession && (
        <ConfirmDialog
          title="Delete conversation"
          message={
            <>
              Delete <strong>{pendingSession.title}</strong>? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => void handleDelete(pendingSession.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </aside>
  );
}
