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
import {
  type DownloadItem,
  downloadSourceName,
  progressFractionOf,
} from "../../../../stores/downloadStore";
import { autoRetryNoticeOf } from "../../../../utils/downloadAutoRetry";
import { formatBytes, rateLabel } from "../../../../utils/format";
import { networkErrorMessage } from "../../../../utils/networkError";
import { downloadProgressLabel } from "../../../../utils/playground";
import { DownloadStatusBadge } from "../DownloadStatusBadge";
import { AutoRetryLine } from "./AutoRetryLine";
import "./DownloadItemCard.css";

/** Human-readable duration in seconds, minutes or hours. */
function elapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/**
 * The line under the bar. A runtime with no known size shows its speed, or "Downloading…" before the
 * first sample; GenieX reports no speed when it has no size. A Playground download's line names the file
 * and its bytes, then its speed and time left once they are known.
 */
function detailText(d: DownloadItem, total: number | null, isImporting: boolean): string {
  if (isImporting) {
    if (d.importingProgress) return d.importingProgress;
    return d.runtime ? "Installing…" : "Importing into GenieX…";
  }
  const remaining = total ? total - d.received : null;
  if (d.playground) {
    const file = downloadProgressLabel(d.playground.progress);
    return d.speed > 0 ? `${file} · ${rateLabel(d.speed, remaining)}` : file;
  }
  if (total === null && d.runtime)
    return d.speed > 0 ? `${formatBytes(d.speed)}/s` : "Downloading…";
  return rateLabel(d.speed, remaining);
}

/** The spinner's label for a step that has no cancel. */
function workingLabel(d: DownloadItem): string {
  return d.runtime ? "Installing" : "Importing";
}

interface DownloadItemCardProps {
  download: DownloadItem;
  /** Active items show progress; history items show the error and resume/remove actions. */
  active: boolean;
  /** The browser's connection state, which decides whether a failed download's retry is waiting for it. */
  online: boolean;
  busy: boolean;
  onCancel: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
}

/** One download in the drawer: live progress when active, outcome and actions when past. */
export function DownloadItemCard({
  download: d,
  active,
  online,
  busy,
  onCancel,
  onResume,
  onRemove,
}: DownloadItemCardProps) {
  const isRuntime = d.runtime !== undefined;
  const isPlayground = d.playground !== undefined;
  const total = d.total && d.total > 0 ? d.total : null;
  const fraction = progressFractionOf(d);
  const pct = fraction ?? 0;
  const isImporting = d.status === "importing";
  const retryNotice = autoRetryNoticeOf(d, online);
  // While the retry waits for the connection or its countdown, the status line replaces the error text.
  const retryWaits = retryNotice?.kind === "offline" || retryNotice?.kind === "scheduled";
  // A runtime's size is known only while it downloads with a total; its import step has no byte count.
  // A Playground download reports its bytes in the detail line instead, per file.
  const reportsBytes = !isPlayground && (!isRuntime || (total !== null && !isImporting));
  // A model's import step has no cancel; a runtime install can be cancelled at any step (the backend
  // honours it during the download and while it waits for the GenieX setup).
  const showsCancel = !isImporting || isRuntime;
  // A runtime with no size, a Playground download before its first event, and any import step show an
  // indeterminate bar.
  const indeterminate =
    (isRuntime && (total === null || isImporting)) ||
    (isPlayground && (isImporting || fraction === null));
  // A failed or cancelled download can be run again. The queue resumes the others; a Playground
  // download starts again from the drawer.
  const canRetry =
    (d.status === "cancelled" || d.status === "error") &&
    (!!d.variant || !!d.aihub || isRuntime || isPlayground);
  const retryVerb = d.status === "error" ? "Retry" : "Resume";
  // A skipped projector and other non-fatal problems show while the download runs and after it ends.
  const warningLines = d.warnings?.map((warning) => (
    <Caption1 key={warning} className="download-card__warning">
      {warning}
    </Caption1>
  ));

  if (!active) {
    return (
      <Card size="small" className="download-card">
        <div className="download-card__header">
          <Text className="download-card__label" title={d.label}>
            {d.label}
          </Text>
          <div className="download-card__actions">
            {canRetry && (
              <Button
                appearance="secondary"
                size="small"
                icon={busy ? <Spinner size="tiny" /> : <PlayRegular />}
                title={`${retryVerb} download`}
                aria-label={`${retryVerb} ${d.label}`}
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
          <DownloadStatusBadge
            status={d.status}
            isRuntime={isRuntime}
            retrying={retryNotice?.kind === "offline" || retryNotice?.kind === "scheduled"}
          />
          {d.received > 0 && reportsBytes && (
            <Caption1>
              {formatBytes(d.received)}
              {total ? ` / ${formatBytes(total)}` : ""}
              {d.finishedAt ? ` · ${elapsed(d.finishedAt - d.startedAt)}` : ""}
            </Caption1>
          )}
        </div>
        {warningLines}
        {d.status === "error" && d.error && !retryWaits && (
          // The friendly text shows; the raw error stays on hover for a bug report.
          <Caption1 className="download-card__error" title={d.error}>
            {networkErrorMessage(d.error, downloadSourceName(d))}
          </Caption1>
        )}
        <AutoRetryLine notice={retryNotice} title={d.error} className="download-card__error" />
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
          <AutoRetryLine notice={retryNotice} />
        </div>
      </div>
      {warningLines}
    </Card>
  );
}
