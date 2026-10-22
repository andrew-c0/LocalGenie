import { Button, Card, CardFooter, CardHeader, Spinner } from "@fluentui/react-components";
import { ChatRegular, DeleteRegular, InfoRegular } from "@fluentui/react-icons";
import { formatCount } from "../../../utils/format";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { CardTitle, Meta } from "../Typography/Typography";
import "./ModelCard.css";

export interface GGUFFileOption {
  filename: string;
  precision: string;
  sizeLabel: string | null;
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
    <Card size="small" className="model-card__card">
      <CardHeader
        header={
          <CardTitle truncate wrap={false}>
            {model.name}
          </CardTitle>
        }
        action={status}
      />

      <div className="model-card__meta">
        {model.installed ? (
          <>
            <Meta>Size: {model.size ?? "—"}</Meta>
            <Meta>Source: {model.source ?? "—"}</Meta>
            {model.precisions && model.precisions.length > 0 && (
              <Meta>{model.precisions.join(" / ")}</Meta>
            )}
            {model.downloadedPrecision && (
              <Meta>
                Precision: <strong>{model.downloadedPrecision}</strong>
              </Meta>
            )}
            {model.contextSize && (
              <Meta>
                Context: <strong>{model.contextSize.toLocaleString()}</strong>
              </Meta>
            )}
            {model.paramCount && (
              <Meta>
                Params: <strong>{(model.paramCount / 1e9).toFixed(1)}B</strong>
              </Meta>
            )}
          </>
        ) : (
          <>
            <Meta>⬇ {fmt(model.downloads)}</Meta>
            <Meta>❤ {fmt(model.likes)}</Meta>
            {model.pipelineTag && <Meta>{model.pipelineTag}</Meta>}
          </>
        )}
      </div>

      <CardFooter className="model-card__actions">
        {isDownloading ? (
          <Button disabled icon={<Spinner size="tiny" />}>
            Pulling…
          </Button>
        ) : model.installed ? (
          <>
            <Button
              appearance="primary"
              icon={<ChatRegular />}
              onClick={onOpenSelector}
              disabled={isLoaded}
            >
              {isLoaded ? "Active" : "Load & Chat"}
            </Button>
            <Button appearance="secondary" icon={<InfoRegular />} onClick={openDetails}>
              Details
            </Button>
            {onRemove && (
              <Button
                appearance="secondary"
                icon={<DeleteRegular />}
                title="Remove model"
                aria-label={`Remove ${model.name}`}
                onClick={() => onRemove(model.name)}
              />
            )}
          </>
        ) : (
          <Button appearance="primary" icon={<InfoRegular />} onClick={openDetails}>
            Details
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
