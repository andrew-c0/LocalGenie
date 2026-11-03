import {
  Button,
  Caption1,
  Card,
  CardHeader,
  ProgressBar,
  Spinner,
  Text,
} from "@fluentui/react-components";
import { DeleteRegular, PauseRegular, PlayRegular } from "@fluentui/react-icons";
import type { DownloadItem } from "../../../../stores/downloadStore";
import { formatBytes } from "../../../../utils/format";
import { DownloadStatusBadge } from "../DownloadStatusBadge";
import "./DownloadItemCard.css";

/** Human-readable ETA from remaining bytes and speed. */
function eta(remaining: number, speed: number): string {
  if (speed <= 0 || remaining <= 0) return "—";
  const s = Math.round(remaining / speed);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Human-readable duration in seconds, minutes or hours. */
function elapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/**
 * The line under the bar. A runtime with no known size shows its speed, or "Downloading…" before the
 * first sample; GenieX reports no speed when it has no size.
 */
function detailText(d: DownloadItem, total: number | null, isImporting: boolean): string {
  if (isImporting) {
    if (d.importingProgress) return d.importingProgress;
    return d.runtime ? "Installing…" : "Importing into GenieX…";
  }
  if (total === null && d.runtime)
    return d.speed > 0 ? `${formatBytes(d.speed)}/s` : "Downloading…";
  return `${formatBytes(d.speed)}/s · ETA ${eta(total ? total - d.received : 0, d.speed)}`;
}

/** The spinner's label for a step that has no cancel. */
function workingLabel(d: DownloadItem): string {
  return d.runtime ? "Installing" : "Importing";
}

interface DownloadItemCardProps {
  download: DownloadItem;
  /** Active items show progress; history items show the error and resume/remove actions. */
  active: boolean;
  busy: boolean;
  onCancel: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
}

/** One download in the drawer: live progress when active, outcome and actions when past. */
export function DownloadItemCard({
  download: d,
  active,
  busy,
  onCancel,
  onResume,
  onRemove,
}: DownloadItemCardProps) {
  const isRuntime = d.runtime !== undefined;
  const total = d.total && d.total > 0 ? d.total : null;
  const pct = total ? d.received / total : 0;
  const isImporting = d.status === "importing";
  // A runtime's size is known only while it downloads with a total; its import step has no byte count.
  const reportsBytes = !isRuntime || (total !== null && !isImporting);
  // A model's import step has no cancel; a runtime install can be cancelled at any step (the backend
  // honours it during the download and while it waits for the GenieX setup).
  const showsCancel = !isImporting || isRuntime;
  // A runtime with no size, and its import step, show an indeterminate bar.
  const indeterminate = isRuntime && (total === null || isImporting);
  const canResume = d.status === "cancelled" && (!!d.variant || !!d.aihub || isRuntime);

  if (!active) {
    return (
      <Card size="small" className="download-card">
        <div className="download-card__header">
          <Text className="download-card__label" title={d.label}>
            {d.label}
          </Text>
          <div className="download-card__actions">
            {canResume && (
              <Button
                appearance="secondary"
                size="small"
                icon={busy ? <Spinner size="tiny" /> : <PlayRegular />}
                title="Resume download"
                aria-label={`Resume ${d.label}`}
                disabled={busy}
                onClick={() => onResume(d.id)}
              />
            )}
            <Button
              appearance="secondary"
              size="small"
              icon={<DeleteRegular />}
              title="Remove from list"
              aria-label={`Remove ${d.label} from list`}
              onClick={() => onRemove(d.id)}
            />
          </div>
        </div>
        <div className="download-card__status">
          <DownloadStatusBadge status={d.status} isRuntime={isRuntime} />
          {d.received > 0 && reportsBytes && (
            <Caption1>
              {formatBytes(d.received)}
              {total ? ` / ${formatBytes(total)}` : ""}
              {d.finishedAt ? ` · ${elapsed(d.finishedAt - d.startedAt)}` : ""}
            </Caption1>
          )}
        </div>
        {d.status === "error" && d.error && (
          <Caption1 className="download-card__error">{d.error}</Caption1>
        )}
      </Card>
    );
  }

  return (
    <Card size="small" className="download-card">
      <CardHeader
        header={<Text className="download-card__label">{d.label}</Text>}
        action={
          showsCancel ? (
            <Button
              appearance="secondary"
              icon={busy ? <Spinner size="tiny" /> : <PauseRegular />}
              title="Cancel download"
              aria-label={`Cancel ${d.label}`}
              disabled={busy}
              onClick={() => onCancel(d.id)}
            />
          ) : (
            <Spinner size="tiny" aria-label={`${workingLabel(d)} ${d.label}`} />
          )
        }
      />
      <div className="download-card__progress">
        <ProgressBar
          value={indeterminate ? undefined : Math.max(0, Math.min(1, pct))}
          aria-label={`Progress for ${d.label}`}
        />
        <div className="download-card__meta">
          {reportsBytes && (
            <Caption1>
              {formatBytes(d.received)}
              {total ? ` / ${formatBytes(total)}` : ""}
              {!isImporting ? ` (${(pct * 100).toFixed(0)}%)` : ""}
            </Caption1>
          )}
          <Caption1>{detailText(d, total, isImporting)}</Caption1>
        </div>
      </div>
    </Card>
  );
}
