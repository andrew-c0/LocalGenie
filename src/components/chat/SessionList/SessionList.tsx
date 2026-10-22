import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Button, Caption1, Tab, TabList } from "@fluentui/react-components";
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
import "./SessionList.css";

/** Sidebar list of chat sessions. Collapsible; New Conversation sits at the bottom. */
export function SessionList() {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const createSession = useChatStore((s) => s.createSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handleDelete = async (id: string) => {
    setConfirmingDelete(false);
    deleteSession(id);
    if (id === activeSessionId) navigate("/chat");
    await db.deleteSession(id).catch(() => {});
  };

  const handleSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    navigate(`/chat/${String(data.value)}`);
  };

  return (
    <aside className={collapsed ? "session-list session-list--collapsed" : "session-list"}>
      <Button
        appearance="secondary"
        icon={collapsed ? <ChevronRightRegular /> : <ChevronLeftRegular />}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand conversations" : "Collapse conversations"}
        title={collapsed ? "Expand conversations" : "Collapse conversations"}
        onClick={() => setCollapsed((v) => !v)}
      />

      {!collapsed && (
        <>
          <TabList
            vertical
            aria-label="Conversations"
            selectedValue={activeSessionId ?? undefined}
            onTabSelect={handleSelect}
          >
            {sessions.map((session) => (
              <Tab key={session.id} value={session.id} title={session.title}>
                {session.title}
              </Tab>
            ))}
          </TabList>
          {sessions.length === 0 && <Caption1>No conversations yet.</Caption1>}
        </>
      )}

      <div className="session-list__footer">
        <Button
          appearance="primary"
          icon={<AddRegular />}
          aria-label="New conversation"
          title="New conversation"
          onClick={() => navigate(`/chat/${createSession()}`)}
        >
          {collapsed ? null : "New Conversation"}
        </Button>
      </div>

      {!collapsed && activeSession && (
        <Button
          appearance="secondary"
          icon={<DeleteRegular />}
          onClick={() => setConfirmingDelete(true)}
        >
          Delete conversation
        </Button>
      )}

      {activeSession && confirmingDelete && (
        <ConfirmDialog
          title="Delete conversation"
          message={
            <>
              Delete <strong>{activeSession.title}</strong>? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => void handleDelete(activeSession.id)}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </aside>
  );
}
