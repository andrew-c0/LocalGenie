import {
  Button,
  Caption1,
  Card,
  CardFooter,
  CardHeader,
  makeStyles,
  Spinner,
  tokens,
} from "@fluentui/react-components";
import { ChatRegular, DeleteRegular, InfoRegular } from "@fluentui/react-icons";
import { formatCount } from "../../../utils/format";
import { StatusBadge } from "../StatusBadge/StatusBadge";

export interface GGUFFileOption {
  filename: string;
  precision: string;
  sizeLabel: string | null;
  version: string;
}

export interface ModelCardData {
  name: string;
  installed: boolean;
  size?: string;
  source?: string;
  precisions?: string[];
  downloads?: number;
  likes?: number;
  pipelineTag?: string;
  /** Precision actually downloaded (e.g. Q4_0), from the local DB. */
  downloadedPrecision?: string;
  /** Native context length reported by the model's config (tokens), from the local DB. */
  contextSize?: number;
  /** Total parameter count from HF safetensors metadata, from the local DB. */
  paramCount?: number;
  /** GGUF variants available on Hugging Face (only set for search results). */
  ggufFiles?: GGUFFileOption[];
  /** Optional status badge shown next to the name (e.g. Qualcomm asset compatibility). */
  badge?: { tone: "green" | "default"; label: string };
  /** Repo is gated on Hugging Face (shows a lock). */
  gated?: boolean;
}

interface ModelCardProps {
  model: ModelCardData;
  /** Model is loaded on the server. */
  isLoaded: boolean;
  isDownloading: boolean;
  /** Whether this card represents a locally installed model (vs. a remote HF result). */
  isLocal: boolean;
  /** Open the header model selector (which loads + binds to the active chat). */
  onOpenSelector: () => void;
  onRemove?: (name: string) => void;
  /** Navigate to model detail page. Passes `isLocal` so the route can pick the right view. */
  onDetails?: (name: string, isLocal: boolean) => void;
}

const useStyles = makeStyles({
  card: {
    minWidth: 0,
  },
  name: {
    justifyContent: "flex-start",
    minWidth: 0,
    maxWidth: "100%",
  },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
  },
});

/** Card for a single model — installed or search result. */
export function ModelCard({
  model,
  isLoaded,
  isDownloading,
  isLocal = false,
  onOpenSelector,
  onRemove,
  onDetails,
}: ModelCardProps) {
  const styles = useStyles();
  const fmt = (n?: number) => (n == null ? "—" : formatCount(n));
  const openDetails = () => onDetails?.(model.name, isLocal);

  const status = model.badge ? (
    <StatusBadge tone={model.badge.tone}>{model.badge.label}</StatusBadge>
  ) : isLoaded ? (
    <StatusBadge tone="green">Loaded</StatusBadge>
  ) : model.installed ? (
    <StatusBadge tone="blue">Installed</StatusBadge>
  ) : model.gated ? (
    <StatusBadge>Gated</StatusBadge>
  ) : (
    <StatusBadge>Available</StatusBadge>
  );

  return (
    <Card size="small" className={styles.card}>
      <CardHeader
        header={
          <Button appearance="transparent" className={styles.name} onClick={openDetails}>
            {model.name}
          </Button>
        }
        action={status}
      />

      <div className={styles.meta}>
        {model.installed ? (
          <>
            <Caption1>Size: {model.size ?? "—"}</Caption1>
            <Caption1>Source: {model.source ?? "—"}</Caption1>
            {model.precisions && model.precisions.length > 0 && (
              <Caption1>{model.precisions.join(" / ")}</Caption1>
            )}
            {model.downloadedPrecision && (
              <Caption1>
                Precision: <strong>{model.downloadedPrecision}</strong>
              </Caption1>
            )}
            {model.contextSize && (
              <Caption1>
                Context: <strong>{model.contextSize.toLocaleString()}</strong>
              </Caption1>
            )}
            {model.paramCount && (
              <Caption1>
                Params: <strong>{(model.paramCount / 1e9).toFixed(1)}B</strong>
              </Caption1>
            )}
          </>
        ) : (
          <>
            <Caption1>⬇ {fmt(model.downloads)}</Caption1>
            <Caption1>❤ {fmt(model.likes)}</Caption1>
            {model.pipelineTag && <Caption1>{model.pipelineTag}</Caption1>}
          </>
        )}
      </div>

      <CardFooter className={styles.actions}>
        {isDownloading ? (
          <Button size="small" disabled icon={<Spinner size="tiny" />}>
            Pulling…
          </Button>
        ) : model.installed ? (
          <>
            <Button
              size="small"
              appearance="primary"
              icon={<ChatRegular />}
              onClick={onOpenSelector}
              disabled={isLoaded}
            >
              {isLoaded ? "Active" : "Load & Chat"}
            </Button>
            <Button
              size="small"
              appearance="secondary"
              icon={<InfoRegular />}
              onClick={openDetails}
            >
              Details
            </Button>
            {onRemove && (
              <Button
                size="small"
                appearance="secondary"
                icon={<DeleteRegular />}
                title="Remove model"
                aria-label={`Remove ${model.name}`}
                onClick={() => onRemove(model.name)}
              />
            )}
          </>
        ) : (
          <Button size="small" appearance="primary" icon={<InfoRegular />} onClick={openDetails}>
            Details
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
