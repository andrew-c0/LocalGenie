import type { ReactNode } from "react";

/** Card container following the Stitch surface style. */
export function SurfaceCard({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`lx-card${className ? ` ${className}` : ""}`}>
      {(title || action) && (
        <div className="lx-card-title" style={{ marginBottom: 12 }}>
          {title}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** Metric card with large tabular value and unit suffix. */
export function MetricCard({
  label,
  value,
  unit,
  sub,
  badge,
  progress,
  progressColor,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  badge?: ReactNode;
  /** 0–100, renders a progress bar when provided. */
  progress?: number;
  progressColor?: "cyan" | "purple" | "green";
}) {
  return (
    <SurfaceCard
      title={
        <>
          {label}
          {badge}
        </>
      }
    >
      <div>
        <span className="lx-metric-value">{value}</span>
        {unit && <span className="lx-metric-unit"> {unit}</span>}
      </div>
      {typeof progress === "number" && (
        <div className="lx-progress" style={{ marginTop: 10 }} role="progressbar">
          <div
            className={`lx-progress-fill${progressColor ? ` ${progressColor}` : ""}`}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
      {sub && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--lx-text-muted)" }}>{sub}</div>
      )}
    </SurfaceCard>
  );
}

export type BadgeTone = "default" | "blue" | "cyan" | "purple" | "green" | "red";

/** Small status pill. */
export function StatusBadge({
  tone = "default",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return <span className={`lx-badge${tone !== "default" ? ` ${tone}` : ""}`}>{children}</span>;
}

/** Progress bar with optional color variant. */
export function ProgressBar({
  value,
  color,
  style,
}: {
  value: number;
  color?: "cyan" | "purple" | "green";
  style?: React.CSSProperties;
}) {
  return (
    <div className="lx-progress" style={style} role="progressbar">
      <div
        className={`lx-progress-fill${color ? ` ${color}` : ""}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** Empty / loading / error state block. */
export function StateBlock({
  icon,
  message,
  children,
}: {
  icon?: ReactNode;
  message: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="lx-empty">
      {icon && <div style={{ fontSize: 22 }}>{icon}</div>}
      <div>{message}</div>
      {children}
    </div>
  );
}
