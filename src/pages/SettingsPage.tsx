import { BrainCircuitRegular, DesktopRegular, InfoRegular } from "@fluentui/react-icons";
import { type ReactElement, useState } from "react";
import AppSettings from "../components/AppSettings";
import ModelSettings from "../components/ModelSettings";
import { StatusBadge } from "../components/ui/primitives";
import { useModelStore } from "../stores/modelStore";

type SectionId = "app" | "inference";

const SECTIONS: {
  id: SectionId;
  label: string;
  desc: string;
  icon: ReactElement;
}[] = [
  {
    id: "app",
    label: "Application & Runtime",
    desc: "Server port, CLI updates",
    icon: <DesktopRegular />,
  },
  {
    id: "inference",
    label: "Inference & Sampling",
    desc: "Model parameters, system prompt",
    icon: <BrainCircuitRegular />,
  },
];

/** Settings page: refined left sub-menu + focused section panel (mirrors Chat layout). */
export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>("app");
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const updateInfo = useModelStore((s) => s.updateInfo);

  const updateBadge = updateInfo?.update_available ?? false;

  return (
    <div className="lx-settingspage">
      {/* ── Section sub-menu ──────────────────────── */}
      <aside className="lx-settings-nav">
        <div className="lx-settings-nav-head">
          <div className="lx-settings-nav-title">System Configuration</div>
          <div className="lx-settings-nav-sub lx-mono">
            {serverStatus.running ? `runtime :${serverStatus.port}` : "runtime offline"}
          </div>
        </div>

        <nav className="lx-settings-nav-list" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`lx-settings-nav-item${section === s.id ? " active" : ""}`}
              onClick={() => setSection(s.id)}
              aria-current={section === s.id ? "true" : undefined}
            >
              <span className="lx-settings-nav-icon">{s.icon}</span>
              <span className="lx-settings-nav-text">
                <span className="lx-settings-nav-label">{s.label}</span>
                <span className="lx-settings-nav-desc">{s.desc}</span>
              </span>
              {s.id === "app" && updateBadge && (
                <span className="lx-settings-nav-badge" title="CLI update available">
                  !
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="lx-settings-nav-footer">
          <div className="lx-settings-nav-footer-row">
            <InfoRegular style={{ fontSize: 14, color: "var(--lx-text-muted)" }} />
            <div>
              <div className="lx-settings-nav-footer-label">Active Model</div>
              <div className="lx-mono lx-settings-nav-footer-value">
                {activeModelId ? activeModelId.split("/").pop() : "none"}
              </div>
            </div>
          </div>
          <StatusBadge tone={serverStatus.running ? "green" : "red"}>
            {serverStatus.running ? "Runtime Connected" : "Runtime Offline"}
          </StatusBadge>
        </div>
      </aside>

      {/* ── Section panel ─────────────────────────── */}
      <div className="lx-settings-panel">
        <div className="lx-settings-panel-head">
          <div>
            <span className="lx-page-eyebrow">● SETTINGS</span>
            <h1 className="lx-page-title" style={{ fontSize: 20 }}>
              {SECTIONS.find((s) => s.id === section)?.label}
            </h1>
          </div>
          <div className="lx-page-actions">
            {section === "inference" && (
              <span className="lx-mono" style={{ fontSize: 11, color: "var(--lx-text-muted)" }}>
                changes persist per model
              </span>
            )}
            {updateBadge && section === "app" && (
              <StatusBadge tone="blue">v{updateInfo?.latest_version} available</StatusBadge>
            )}
          </div>
        </div>

        <div className="lx-settings-panel-body">
          {section === "app" && <AppSettings updateInfo={updateInfo} />}
          {section === "inference" && <ModelSettings />}
        </div>

        <div className="lx-settings-panel-footer">
          <span>
            Preferences are stored locally and applied on the next server start where applicable.
          </span>
        </div>
      </div>
    </div>
  );
}
