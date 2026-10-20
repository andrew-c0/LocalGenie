import { Button, Spinner } from "@fluentui/react-components";
import { ChatRegular, DeleteRegular, InfoRegular } from "@fluentui/react-icons";
import { formatCount } from "../../../utils/format";
import { StatusBadge } from "../primitives";

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
  const ggufFiles = model.ggufFiles ?? [];
  const hasGGUF = !model.installed && ggufFiles.length > 0;

  return (
    <div className="lx-model-card">
      <div className="model-card-head">
        <div
          className="lx-model-card-name"
          style={{ cursor: "pointer" }}
          onClick={() => onDetails?.(model.name, isLocal)}
        >
          {model.name}
        </div>
        {model.badge ? (
          <StatusBadge tone={model.badge.tone}>{model.badge.label}</StatusBadge>
        ) : isLoaded ? (
          <StatusBadge tone="green">Loaded</StatusBadge>
        ) : model.installed ? (
          <StatusBadge tone="blue">Installed</StatusBadge>
        ) : model.gated ? (
          <StatusBadge>Gated</StatusBadge>
        ) : (
          <StatusBadge>Available</StatusBadge>
        )}
      </div>

      {model.installed ? (
        <div className="lx-model-card-meta">
          <span>Size: {model.size ?? "—"}</span>
          <span>Source: {model.source ?? "—"}</span>
          {model.precisions && model.precisions.length > 0 && (
            <span>{model.precisions.join(" / ")}</span>
          )}
          {model.downloadedPrecision && (
            <span>
              Precision: <strong>{model.downloadedPrecision}</strong>
            </span>
          )}
          {model.contextSize && (
            <span>
              Context: <strong>{model.contextSize.toLocaleString()}</strong>
            </span>
          )}
          {model.paramCount && (
            <span>
              Params: <strong>{(model.paramCount / 1e9).toFixed(1)}B</strong>
            </span>
          )}
        </div>
      ) : (
        <div className="lx-model-card-meta">
          <span>⬇ {fmt(model.downloads)}</span>
          <span>❤ {fmt(model.likes)}</span>
          {model.pipelineTag && <span>{model.pipelineTag}</span>}
        </div>
      )}

      <div className="lx-model-card-actions">
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
              title="View model details"
              onClick={() => onDetails?.(model.name, isLocal)}
            >
              Details
            </Button>
            {onRemove && (
              <Button
                size="small"
                appearance="secondary"
                icon={<DeleteRegular />}
                title="Remove model"
                onClick={() => onRemove(model.name)}
              />
            )}
          </>
        ) : hasGGUF ? (
          <div className="lx-gguf-picker" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Button
              size="small"
              appearance="primary"
              icon={<InfoRegular />}
              onClick={() => onDetails?.(model.name, isLocal)}
            >
              Details
            </Button>
          </div>
        ) : (
          <Button
            size="small"
            appearance="primary"
            icon={<InfoRegular />}
            onClick={() => onDetails?.(model.name, isLocal)}
          >
            Details
          </Button>
        )}
      </div>
    </div>
  );
}
