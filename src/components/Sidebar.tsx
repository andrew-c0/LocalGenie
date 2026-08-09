import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  Spinner,
  Toast,
  ToastTitle,
  ToastBody,
  useToastController,
} from "@fluentui/react-components";
import { listen } from "@tauri-apps/api/event";
import {
  AddRegular,
  ChatRegular,
  SettingsRegular,
  DeleteRegular,
  ArrowDownloadRegular,
  ArrowUpRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { useChatStore } from "../stores/chatStore";
import * as db from "../services/database";
import * as geniex from "../services/geniex";
import type { UpdateInfo } from "../types";
import ModelSelector from "./ModelSelector";

interface SidebarProps {
  onOpenModelBrowser: () => void;
  onOpenAppSettings: () => void;
  updateInfo: UpdateInfo | null;
  onDismissUpdate: () => void;
}

export default function Sidebar({
  onOpenModelBrowser,
  onOpenAppSettings,
  updateInfo,
  onDismissUpdate,
}: SidebarProps) {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const createSession = useChatStore((s) => s.createSession);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const deleteSession = useChatStore((s) => s.deleteSession);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const { dispatchToast } = useToastController("app-toaster");
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  // Listen for progress events while updating
  useEffect(() => {
    if (!updating) return;
    const unlisten = listen<{ message: string }>("geniex-update-progress", (event) => {
      setUpdateStatus(event.payload.message);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updating]);

  const handleNewChat = () => {
    const id = createSession();
    setActiveSession(id);
  };

  const handleDelete = async (id: string) => {
    deleteSession(id);
    await db.deleteSession(id).catch(() => {});
    setDeleteTarget(null);
  };

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateStatus("Starting update...");
    try {
      await geniex.updateGeniex();

      // Re-check version after update to confirm it took effect.
      const info = await geniex.checkForCliUpdate();
      if (!info.update_available) {
        // Binary was replaced successfully.
        dispatchToast(
          <Toast><ToastTitle>Update complete</ToastTitle><ToastBody>Updated to CLI {info.latest_version}.</ToastBody></Toast>,
          { intent: "success" },
        );
        onDismissUpdate();
      } else {
        // Package downloaded but binary not replaced (common on Windows — needs
        // the running process to exit first). Inform the user and dismiss the
        // banner so they are not stuck in a retry loop.
        dispatchToast(
          <Toast>
            <ToastTitle>Update downloaded</ToastTitle>
            <ToastBody>Restart the app to finish updating to {info.latest_version}.</ToastBody>
          </Toast>,
          { intent: "warning" },
        );
        onDismissUpdate();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[sidebar] Update failed:", msg);
      dispatchToast(
        <Toast><ToastTitle>Update failed</ToastTitle><ToastBody>{msg}</ToastBody></Toast>,
        { intent: "error" },
      );
    } finally {
      setUpdating(false);
      setUpdateStatus(null);
    }
  };

  return (
    <div className="sidebar">
      {/* ── Header ────────────────────────────────── */}
      <div className="sidebar-header">
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
        {/* ── Notifications Area ──────────────────── */}
        {updateInfo?.update_available && (
          <div className="sidebar-notification">
            <div className="sidebar-notification-header">
              <span className="sidebar-notification-title">Update Available</span>
              <Button
                appearance="transparent"
                size="small"
                onClick={onDismissUpdate}
                className="notification-dismiss-btn"
                title="Dismiss"
              >
                <DismissRegular />
              </Button>
            </div>
            <div className="sidebar-notification-body">
              <span className="sidebar-notification-detail">
                {updating && updateStatus
                  ? updateStatus
                  : `${updateInfo.current_version} → ${updateInfo.latest_version}`}
              </span>
              <Button
                appearance="primary"
                size="small"
                icon={updating ? undefined : <ArrowUpRegular />}
                onClick={handleUpdate}
                disabled={updating}
                className="notification-update-btn"
              >
                {updating ? <Spinner size="tiny" /> : "Update Now"}
              </Button>
            </div>
          </div>
        )}

        <hr className="sidebar-divider" />

        <Button
          appearance="subtle"
          size="small"
          icon={<SettingsRegular />}
          onClick={onOpenAppSettings}
          className="sidebar-btn-full"
        >
          Settings
        </Button>
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