import { Button } from "@fluentui/react-components";
import { AddRegular, DeleteRegular } from "@fluentui/react-icons";
import * as db from "../../../services/database";
import { useChatStore } from "../../../stores/chatStore";
import "./SessionList.css";

/** Sidebar list of chat sessions with create + delete actions. */
export function SessionList() {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const createSession = useChatStore((s) => s.createSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const handleDelete = async (id: string) => {
    deleteSession(id);
    await db.deleteSession(id).catch(() => {});
  };

  return (
    <aside className="lx-chat-sessions">
      <div className="session-list-new">
        <Button
          appearance="primary"
          size="small"
          icon={<AddRegular />}
          style={{ width: "100%" }}
          onClick={() => {
            const id = createSession();
            setActiveSession(id);
          }}
        >
          New Conversation
        </Button>
      </div>
      <div className="session-list-scroll">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`chat-history-item ${session.id === activeSessionId ? "active" : ""}`}
          >
            <button
              type="button"
              className="chat-history-item-text session-item-text"
              onClick={() => setActiveSession(session.id)}
            >
              {session.title}
            </button>
            <button
              type="button"
              className="chat-history-item-delete"
              title="Delete conversation"
              aria-label={`Delete conversation ${session.title}`}
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(session.id);
              }}
            >
              <DeleteRegular />
            </button>
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="sidebar-empty session-empty">No conversations yet.</div>
        )}
      </div>
    </aside>
  );
}
