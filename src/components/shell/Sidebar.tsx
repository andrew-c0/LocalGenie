import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import {
  ChatRegular,
  CubeRegular,
  GridRegular,
  PlayCircleRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import { type ReactElement, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import * as db from "../../services/database";
import { useChatStore } from "../../stores/chatStore";
import { useModelStore } from "../../stores/modelStore";

const APP_VERSION = "v0.1.0";

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: ReactElement;
}[] = [
  { to: "/", label: "Overview", icon: <GridRegular /> },
  { to: "/models", label: "Models", icon: <CubeRegular /> },
  { to: "/chat", label: "Chat & Playground", icon: <ChatRegular /> },
  { to: "/prompt-benchmark", label: "Benchmarks", icon: <PlayCircleRegular /> },
  { to: "/settings", label: "Settings", icon: <SettingsRegular /> },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    deleteSession(id);
    await db.deleteSession(id).catch(() => {});
    setDeleteTarget(null);
  };

  return (
    <aside className="lx-sidebar">
      {/* ── Brand ─────────────────────────────────── */}
      <button
        type="button"
        className="lx-sidebar-brand"
        title="Go to Overview"
        onClick={() => navigate("/")}
        style={{ cursor: "pointer", border: "none", background: "transparent", textAlign: "left" }}
      >
        <div className="lx-sidebar-brand-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2c.6 4.8 4.2 8.4 9 9-4.8.6-8.4 4.2-9 9-.6-4.8-4.2-8.4-9-9 4.8-.6 8.4-4.2 9-9z"
              fill="url(#lxBrandGrad)"
            />
            <defs>
              <linearGradient id="lxBrandGrad" x1="3" y1="3" x2="21" y2="21">
                <stop offset="0" stopColor="#a3c9ff" />
                <stop offset="0.5" stopColor="#0078D4" />
                <stop offset="1" stopColor="#8764B8" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <div className="lx-sidebar-brand-name">LocalGenie</div>
          <div className="lx-sidebar-brand-sub">{APP_VERSION} · Local Runtime</div>
        </div>
      </button>

      {/* ── Navigation ────────────────────────────── */}
      <nav className="lx-sidebar-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => `lx-nav-item${isActive ? " active" : ""}`}
            aria-label={item.label}
          >
            {item.icon}
            <span className="lx-nav-label">{item.label}</span>
            {item.to === "/models" && models.length > 0 && (
              <span className="lx-nav-item-badge">{models.length}</span>
            )}
            {item.to === "/chat" && activeSessionId && (
              <span className="lx-nav-item-badge" aria-hidden="true" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Hardware footer ───────────────────────── */}
      <div className="lx-sidebar-footer">
        <div>HARDWARE ACCEL</div>
        <div className="lx-sidebar-footer-mono">
          {serverStatus.running
            ? `Server :${serverStatus.port} · ${serverStatus.models.length} loaded`
            : "Server offline"}
        </div>
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
    </aside>
  );
}
