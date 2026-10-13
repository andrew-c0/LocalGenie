import { Button, ProgressBar } from "@fluentui/react-components";
import {
  CheckmarkRegular,
  DeleteRegular,
  DismissRegular,
  PauseRegular,
  PlayRegular,
  ArrowImportRegular,
  ArrowDownloadRegular,
} from "@fluentui/react-icons";
import { useEffect } from "react";
import { cancelDownload, downloadFile } from "../../services/download";
import { useDownloadStore } from "../../stores/downloadStore";
import { formatBytes } from "../../utils/format";

/** Human-readable ETA from remaining bytes and speed. */
function eta(remaining: number, speed: number): string {
  if (speed <= 0 || remaining <= 0) return "—";
  const s = Math.round(remaining / speed);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

type DownloadStatus = "downloading" | "importing" | "finished" | "error" | "cancelled";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Status badge with color coding. */
function StatusBadge({
  status,
  importingProgress,
}: {
  status: DownloadStatus;
  importingProgress?: string;
}) {
  const config: Record<DownloadStatus, { icon: React.ReactNode; color: string; label: string }> = {
    downloading: { icon: <ArrowDownloadRegular />, color: "var(--lx-brand)", label: "Downloading" },
    importing: {
      icon: <ArrowImportRegular />,
      color: "var(--lx-telemetry)",
      label: importingProgress ?? "Importing",
    },
    finished: { icon: <CheckmarkRegular />, color: "var(--lx-telemetry)", label: "Finished" },
    error: {
      icon: <span style={{ fontSize: 10 }}>⚠</span>,
      color: "var(--lx-error)",
      label: "Error",
    },
    cancelled: { icon: <PauseRegular />, color: "var(--lx-text-muted)", label: "Cancelled" },
  };
  const c = config[status];
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        color: c.color,
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      <span style={{ display: "flex" }}>{c.icon}</span>
      <span>{c.label}</span>
    </span>
  );
}

/** Right-side drawer listing past, active and cancelled downloads. */
export default function DownloadDrawer({ open, onClose }: Props) {
  const downloads = useDownloadStore((s) => s.downloads);
  const remove = useDownloadStore((s) => s.remove);
  const clearFinished = useDownloadStore((s) => s.clearFinished);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleCancel = async (id: string) => {
    await cancelDownload(id).catch(() => undefined);
  };

  /** Resume a cancelled download by re-invoking downloadFile (backend resumes from partial). */
  const handleResume = (id: string, url?: string) => {
    if (!url) return;
    const store = useDownloadStore.getState();
    store.setStatus(id, "downloading");
    downloadFile(url, id)
      .then(() => store.setStatus(id, "finished"))
      .catch((err) => {
        const msg = String(err);
        if (!msg.includes("cancelled")) store.setStatus(id, "error", msg);
      });
  };

  // Categorize downloads: active (downloading/importing), past (finished/error/cancelled)
  const active = downloads.filter((d) => d.status === "downloading" || d.status === "importing");
  const past = downloads.filter(
    (d) => d.status === "finished" || d.status === "error" || d.status === "cancelled",
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: overlay dismiss target
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3000,
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Downloads"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 380,
          maxWidth: "90vw",
          background: "var(--lx-surface-lowest)",
          borderLeft: "1px solid var(--lx-outline)",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--lx-outline)",
          }}
        >
          <strong style={{ fontSize: 13 }}>Downloads</strong>
          <div style={{ display: "flex", gap: 4 }}>
            {past.length > 0 && (
              <Button appearance="transparent" size="small" onClick={clearFinished}>
                Clear finished
              </Button>
            )}
            <Button
              appearance="transparent"
              size="small"
              icon={<DismissRegular />}
              onClick={onClose}
              aria-label="Close downloads"
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {downloads.length === 0 && (
            <div className="lx-empty" style={{ padding: 24 }}>
              No downloads yet.
            </div>
          )}

          {active.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--lx-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  margin: "4px 0 8px",
                }}
              >
                Active
              </div>
              {active.map((d) => {
                const pct = d.total ? d.received / d.total : 0;
                const remaining = d.total ? d.total - d.received : 0;
                const isImporting = d.status === "importing";
                return (
                  <div
                    key={d.id}
                    className="lx-card"
                    style={{
                      padding: 12,
                      marginBottom: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        className="lx-mono"
                        style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {d.label}
                      </span>
                      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                        {!isImporting && (
                          <Button
                            appearance="transparent"
                            size="small"
                            icon={<PauseRegular />}
                            title="Cancel download"
                            aria-label={`Cancel ${d.label}`}
                            onClick={() => handleCancel(d.id)}
                          />
                        )}
                        {isImporting && (
                          <StatusBadge status={d.status} importingProgress={d.importingProgress} />
                        )}
                      </div>
                    </div>
                    <ProgressBar
                      value={Math.max(0, Math.min(1, pct ?? 0))}
                      style={{ height: 4 }}
                      aria-label={`Progress for ${d.label}`}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 11,
                        color: "var(--lx-text-muted)",
                      }}
                    >
                      <span>
                        {formatBytes(d.received)}
                        {d.total ? ` / ${formatBytes(d.total)}` : ""}
                        {pct != null && !isImporting ? ` (${(pct * 100).toFixed(0)}%)` : ""}
                      </span>
                      <span>
                        {isImporting
                          ? "Importing into GenieX…"
                          : `${formatBytes(d.speed)}/s · ETA ${eta(remaining, d.speed)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {past.length > 0 && (
            <>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--lx-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  margin: "12px 0 8px",
                }}
              >
                History
              </div>
              {past.map((d) => (
                <div
                  key={d.id}
                  className="lx-card"
                  style={{
                    padding: 12,
                    marginBottom: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ flexShrink: 0 }}>
                    <StatusBadge status={d.status} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="lx-mono"
                      style={{
                        fontSize: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.label}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--lx-text-muted)" }}>
                      {d.status === "error" && d.error ? d.error : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    {d.status === "cancelled" && d.url && (
                      <Button
                        appearance="transparent"
                        size="small"
                        icon={<PlayRegular />}
                        title="Resume download"
                        aria-label={`Resume ${d.label}`}
                        onClick={() => handleResume(d.id, d.url)}
                      />
                    )}
                    <Button
                      appearance="transparent"
                      size="small"
                      icon={<DeleteRegular />}
                      title="Remove from list"
                      aria-label={`Remove ${d.label} from list`}
                      onClick={() => remove(d.id)}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
