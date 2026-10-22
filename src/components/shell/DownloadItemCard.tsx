import {
  Button,
  Caption1,
  Card,
  CardHeader,
  makeStyles,
  ProgressBar,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { DeleteRegular, PauseRegular, PlayRegular } from "@fluentui/react-icons";
import type { DownloadItem } from "../../stores/downloadStore";
import { formatBytes } from "../../utils/format";
import { DownloadStatusBadge } from "./DownloadStatusBadge";

/** Human-readable ETA from remaining bytes and speed. */
function eta(remaining: number, speed: number): string {
  if (speed <= 0 || remaining <= 0) return "—";
  const s = Math.round(remaining / speed);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

const useStyles = makeStyles({
  card: {
    width: "100%",
  },
  label: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: tokens.fontFamilyMonospace,
  },
  meta: {
    display: "flex",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
  },
  progress: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
});

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
  const styles = useStyles();
  const pct = d.total ? d.received / d.total : 0;
  const remaining = d.total ? d.total - d.received : 0;
  const isImporting = d.status === "importing";

  if (!active) {
    return (
      <Card size="small" className={styles.card}>
        <CardHeader
          header={<Text className={styles.label}>{d.label}</Text>}
          description={
            <>
              <DownloadStatusBadge status={d.status} />
              {d.status === "error" && d.error && <Caption1>{d.error}</Caption1>}
            </>
          }
          action={
            <>
              {d.status === "cancelled" && d.variant && (
                <Button
                  appearance="transparent"
                  size="small"
                  icon={busy ? <Spinner size="tiny" /> : <PlayRegular />}
                  title="Resume download"
                  aria-label={`Resume ${d.label}`}
                  disabled={busy}
                  onClick={() => onResume(d.id)}
                />
              )}
              <Button
                appearance="transparent"
                size="small"
                icon={<DeleteRegular />}
                title="Remove from list"
                aria-label={`Remove ${d.label} from list`}
                onClick={() => onRemove(d.id)}
              />
            </>
          }
        />
      </Card>
    );
  }

  return (
    <Card size="small" className={styles.card}>
      <CardHeader
        header={<Text className={styles.label}>{d.label}</Text>}
        action={
          isImporting ? (
            <DownloadStatusBadge status={d.status} importingProgress={d.importingProgress} />
          ) : (
            <Button
              appearance="transparent"
              size="small"
              icon={busy ? <Spinner size="tiny" /> : <PauseRegular />}
              title="Cancel download"
              aria-label={`Cancel ${d.label}`}
              disabled={busy}
              onClick={() => onCancel(d.id)}
            />
          )
        }
      />
      <div className={styles.progress}>
        <ProgressBar value={Math.max(0, Math.min(1, pct))} aria-label={`Progress for ${d.label}`} />
        <div className={styles.meta}>
          <Caption1>
            {formatBytes(d.received)}
            {d.total ? ` / ${formatBytes(d.total)}` : ""}
            {!isImporting ? ` (${(pct * 100).toFixed(0)}%)` : ""}
          </Caption1>
          <Caption1>
            {isImporting
              ? "Importing into GenieX…"
              : `${formatBytes(d.speed)}/s · ETA ${eta(remaining, d.speed)}`}
          </Caption1>
        </div>
      </div>
    </Card>
  );
}
