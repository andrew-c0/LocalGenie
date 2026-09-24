import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import { AddRegular, DeleteRegular, DismissRegular } from "@fluentui/react-icons";
import { useState } from "react";
import ChatArea from "../components/ChatArea";
import ChatInput from "../components/ChatInput";
import { StateBlock, StatusBadge } from "../components/ui/primitives";
import * as db from "../services/database";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";

const MAX_CONTEXT_CHARS = 8192;

/** Full chat workspace: session list + context header + thread + composer. */
export default function ChatPage() {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const createSession = useChatStore((s) => s.createSession);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    deleteSession(id);
    await db.deleteSession(id).catch(() => {});
    setDeleteTarget(null);
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const contextChars = activeSession?.contextChars ?? 0;
  const contextPct = Math.min(100, Math.round((contextChars / MAX_CONTEXT_CHARS) * 100));

  return (
    <div className="lx-chatpage">
      {/* ── Delete confirmation ──────────────────── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(_, data) => {
          if (!data.open) setDeleteTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogContent>
              Are you sure you want to delete this conversation? This cannot be undone.
              <div className="dialog-footer">
                <Button appearance="secondary" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  appearance="primary"
                  onClick={() => deleteTarget && handleDelete(deleteTarget)}
                >
                  Delete
                </Button>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* ── Session list ─────────────────────────── */}
      <aside className="lx-chat-sessions">
        <div style={{ padding: 12, borderBottom: "1px solid var(--lx-outline)" }}>
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
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`chat-history-item ${session.id === activeSessionId ? "active" : ""}`}
            >
              <button
                type="button"
                className="chat-history-item-text"
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  font: "inherit",
                  cursor: "pointer",
                  flex: 1,
                  textAlign: "left",
                  padding: 0,
                }}
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
                  setDeleteTarget(session.id);
                }}
              >
                <DeleteRegular />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="sidebar-empty" style={{ fontSize: 12 }}>
              No conversations yet.
            </div>
          )}
        </div>
      </aside>

      {/* ── Conversation canvas ──────────────────── */}
      <div className="lx-chat-canvas">
        {/* Context header — only shown when a conversation is selected */}
        {activeSession && (
          <div className="lx-chat-context">
            <strong style={{ fontSize: 13 }}>
              {activeModelId ? activeModelId.split("/").pop() : "No model selected"}
            </strong>
            <StatusBadge tone={serverStatus.running ? "cyan" : "red"}>
              {serverStatus.running ? "Inference Ready" : "Server Offline"}
            </StatusBadge>
            {isStreaming && <StatusBadge tone="purple">Streaming…</StatusBadge>}
            <span className="lx-titlebar-spacer" />
            <span className="lx-mono" style={{ fontSize: 11, color: "var(--lx-text-muted)" }}>
              Context: {(contextChars / 1000).toFixed(1)}k / 8k chars
            </span>
            <div className="lx-progress" style={{ width: 90 }}>
              <div
                className="lx-progress-fill"
                style={{
                  width: `${contextPct}%`,
                  background: contextPct > 90 ? "var(--lx-error)" : "var(--lx-telemetry)",
                }}
              />
            </div>
            <Button
              appearance="subtle"
              size="small"
              icon={<DismissRegular />}
              title="Close conversation"
              onClick={() => setActiveSession(null)}
            />
          </div>
        )}

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
