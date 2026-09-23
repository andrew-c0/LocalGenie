import { GaugeRegular, PlayCircleRegular } from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { StatusBadge } from "../components/ui/primitives";
import { useModelStore } from "../stores/modelStore";

const SUITE_HOME = "/prompt-benchmark/playground";

const SECTIONS: {
  to: string;
  label: string;
  desc: string;
  icon: ReactElement;
}[] = [
  {
    to: SUITE_HOME,
    label: "Prompt Benchmark",
    desc: "Fixed-prompt TTFT & throughput",
    icon: <PlayCircleRegular />,
  },
  {
    to: "/prompt-benchmark/dashboard",
    label: "Performance Dashboard",
    desc: "Chat-derived KPIs & ranking",
    icon: <GaugeRegular />,
  },
];

/**
 * Benchmark Suite — the single benchmark destination in the app. Hosts the
 * prompt benchmark playground and the performance dashboard as nested routes,
 * mirroring the Settings page layout.
 */
export default function PromptBenchmarkPage() {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);

  return (
    <div className="lx-settingspage">
      {/* ── Section sub-menu ──────────────────────── */}
      <aside className="lx-settings-nav">
        <div className="lx-settings-nav-head">
          <div className="lx-settings-nav-title">Benchmark Suite</div>
          <div className="lx-settings-nav-sub lx-mono">
            {serverStatus.running ? `runtime :${serverStatus.port}` : "runtime offline"}
          </div>
        </div>

        <nav className="lx-settings-nav-list" aria-label="Benchmark sections">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) => `lx-settings-nav-item${isActive ? " active" : ""}`}
            >
              <span className="lx-settings-nav-icon">{s.icon}</span>
              <span className="lx-settings-nav-text">
                <span className="lx-settings-nav-label">{s.label}</span>
                <span className="lx-settings-nav-desc">{s.desc}</span>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="lx-settings-nav-footer">
          <div className="lx-settings-nav-footer-row">
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
        <div className="lx-settings-panel-body lx-bench-suite-body">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
