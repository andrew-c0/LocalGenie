import { Button, Spinner } from "@fluentui/react-components";
import { ArrowDownloadRegular, ChatRegular, DeleteRegular } from "@fluentui/react-icons";
import { formatCount } from "../../../utils/format";
import { StatusBadge } from "../primitives";
import "./ModelCard.css";

export interface ModelCardData {
  name: string;
  installed: boolean;
  size?: string;
  source?: string;
  precisions?: string[];
  downloads?: number;
  likes?: number;
  pipelineTag?: string;
}

interface ModelCardProps {
  model: ModelCardData;
  /** Model is loaded on the server. */
  isLoaded: boolean;
  isDownloading: boolean;
  onLoad: (name: string) => void;
  onDownload: (name: string) => void;
  onRemove?: (name: string) => void;
}

/** Card for a single model — installed or search result. */
export function ModelCard({
  model,
  isLoaded,
  isDownloading,
  onLoad,
  onDownload,
  onRemove,
}: ModelCardProps) {
  const fmt = (n?: number) => (n == null ? "—" : formatCount(n));

  return (
    <div className="lx-model-card">
      <div className="model-card-head">
        <div className="lx-model-card-name">{model.name}</div>
        {isLoaded ? (
          <StatusBadge tone="green">Loaded</StatusBadge>
        ) : model.installed ? (
          <StatusBadge tone="blue">Installed</StatusBadge>
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
              onClick={() => onLoad(model.name)}
              disabled={isLoaded}
            >
              {isLoaded ? "Active" : "Load & Chat"}
            </Button>
            {onRemove && (
              <Button
                size="small"
                appearance="subtle"
                icon={<DeleteRegular />}
                title="Remove model"
                onClick={() => onRemove(model.name)}
              />
            )}
          </>
        ) : (
          <Button
            size="small"
            appearance="primary"
            icon={<ArrowDownloadRegular />}
            onClick={() => onDownload(model.name)}
          >
            Download
          </Button>
        )}
      </div>
    </div>
  );
}
