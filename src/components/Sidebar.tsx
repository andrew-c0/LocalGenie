import { useState } from "react";
import {
  Button,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
} from "@fluentui/react-components";
import {
  AddRegular,
  ChatRegular,
  SettingsRegular,
  DeleteRegular,
  ArrowDownloadRegular,
} from "@fluentui/react-icons";
import { useChatStore } from "../stores/chatStore";
import * as db from "../services/database";
import type { UpdateInfo } from "../types";
import ModelSelector from "./ModelSelector";

interface SidebarProps {
  onOpenModelBrowser: () => void;
  onOpenAppSettings: () => void;
  updateInfo: UpdateInfo | null;
}

export default function Sidebar({
  onOpenModelBrowser,
  onOpenAppSettings,
  updateInfo,
}: SidebarProps) {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const createSession = useChatStore((s) => s.createSession);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleNewChat = () => {
    const id = createSession();
    setActiveSession(id);
  };

  const handleDelete = async (id: string) => {
    deleteSession(id);
    await db.deleteSession(id).catch(() => {});
    setDeleteTarget(null);
  };

  return (
    <div className="sidebar">
      {/* ── Header ────────────────────────────────── */}
      <div className="sidebar-header">
        <div className="sidebar-logo-row">
          <div
            className="sidebar-logo sidebar-logo-clickable"
            title="Go home"
            onClick={() => setActiveSession(null)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setActiveSession(null);
            }}
          >
            <div className="sidebar-logo-icon">GX</div>
            <div>
              <h1>LocalGenie</h1>
              <span>Qualcomm AI Hub</span>
            </div>
          </div>

          <Button
            appearance="subtle"
            icon={<SettingsRegular />}
            onClick={onOpenAppSettings}
            className="sidebar-settings-btn"
            title="Settings"
            aria-label="Settings"
          >
            {updateInfo?.update_available && (
              <span className="sidebar-settings-badge" aria-hidden="true" />
            )}
          </Button>
        </div>

        <div className="sidebar-model-selector">
          <ModelSelector />
        </div>

        <div className="sidebar-button-row">
          <Button
            appearance="subtle"
            size="small"
            icon={<ArrowDownloadRegular />}
            onClick={onOpenModelBrowser}
            className="sidebar-btn-full"
          >
            Models
          </Button>
        </div>
      </div>

      {/* ── New Chat Button ───────────────────────── */}
      <div className="sidebar-new-chat-wrap">
        <Button
          appearance="primary"
          icon={<AddRegular />}
          onClick={handleNewChat}
          className="sidebar-btn-100"
        >
          New Chat
        </Button>
      </div>

      {/* ── Chat History ──────────────────────────── */}
      <div className="sidebar-content">
        <div className="sidebar-section-title">Chat History</div>
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`chat-history-item ${session.id === activeSessionId ? "active" : ""}`}
            onClick={() => setActiveSession(session.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setActiveSession(session.id);
            }}
            role="button"
            tabIndex={0}
          >
            <ChatRegular className="chat-history-item-icon" />
            <span className="chat-history-item-text">{session.title}</span>
            <span className="chat-history-item-actions">
              <Button
                appearance="transparent"
                size="small"
                icon={<DeleteRegular />}
                title="Delete chat"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(session.id);
                }}
              />
            </span>
          </div>
        ))}

        {sessions.length === 0 && <div className="sidebar-empty">No conversations yet.</div>}
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="sidebar-footer">
        <hr className="sidebar-divider" />
      </div>

      {/* ── Delete Confirmation ────────────────────── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(_, data) => {
          if (!data.open) setDeleteTarget(null);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Chat</DialogTitle>
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
    </div>
  );
}