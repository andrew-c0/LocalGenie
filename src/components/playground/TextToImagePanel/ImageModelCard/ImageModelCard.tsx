import { Button, Card } from "@fluentui/react-components";
import type { ImageDownloadState, ImageModel } from "../../../../types";
import { formatBytes } from "../../../../utils/format";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { ExternalLink } from "../../../ui/ExternalLink/ExternalLink";
import { Flex } from "../../../ui/Flex/Flex";
import type { BadgeTone } from "../../../ui/StatusBadge/StatusBadge";
import { StatusBadge } from "../../../ui/StatusBadge/StatusBadge";
import { Body, CardTitle, Meta } from "../../../ui/Typography/Typography";
import { ModelDownloadProgress } from "./ModelDownloadProgress";

type ModelStatus = "ready" | "downloading" | "notDownloaded";

const STATUS_BADGE: Record<ModelStatus, { tone: BadgeTone; label: string }> = {
  ready: { tone: "green", label: "Ready" },
  downloading: { tone: "blue", label: "Downloading" },
  notDownloaded: { tone: "default", label: "Not downloaded" },
};

function modelStatusOf(model: ImageModel, isDownloading: boolean): ModelStatus {
  if (isDownloading) return "downloading";
  return model.downloaded ? "ready" : "notDownloaded";
}

interface ImageModelCardProps {
  model: ImageModel;
  isSelected: boolean;
  /** This model's download, if one was started in this session. */
  download: ImageDownloadState | undefined;
  /** Another model is downloading. Downloads run one at a time. */
  isOtherDownloading: boolean;
  /** A generation uses this model, or it is being deleted. Delete is off then. */
  isDeleteBusy: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onCancelDownload: () => void;
  onDelete: () => void;
}

/** One image model: what it is, its licence and size, its download state and the actions for it. */
export default function ImageModelCard({
  model,
  isSelected,
  download,
  isOtherDownloading,
  isDeleteBusy,
  onSelect,
  onDownload,
  onCancelDownload,
  onDelete,
}: ImageModelCardProps) {
  const isDownloading = download?.status === "downloading";
  const badge = STATUS_BADGE[modelStatusOf(model, isDownloading)];

  return (
    <Card selected={isSelected}>
      <Flex direction="column" gap="s">
        <Flex justify="between" align="center" gap="m">
          <CardTitle>{model.name}</CardTitle>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </Flex>
        <Body>{model.description}</Body>

        <Flex justify="between" align="center" gap="m">
          <Meta>Total size</Meta>
          <Body>{formatBytes(model.totalBytes)}</Body>
        </Flex>
        <Flex justify="between" align="center" gap="m">
          <Meta>Licence</Meta>
          <ExternalLink url={model.licenseUrl}>{model.license}</ExternalLink>
        </Flex>

        {isDownloading && <ModelDownloadProgress progress={download.progress} />}
        {download?.status === "error" && download.error && <ErrorBanner message={download.error} />}
        {download?.status === "cancelled" && <Meta>Download cancelled.</Meta>}

        <Flex gap="s" align="center" wrap>
          {isDownloading && (
            <Button appearance="secondary" onClick={onCancelDownload}>
              Cancel
            </Button>
          )}
          {!isDownloading && !model.downloaded && (
            <Button appearance="primary" onClick={onDownload} disabled={isOtherDownloading}>
              Download
            </Button>
          )}
          {!isDownloading && model.downloaded && !isSelected && (
            <Button appearance="secondary" onClick={onSelect}>
              Use this model
            </Button>
          )}
          {!isDownloading && model.downloaded && isSelected && (
            <Button appearance="secondary" disabled>
              Selected
            </Button>
          )}
          {!isDownloading && model.downloaded && (
            <Button appearance="secondary" onClick={onDelete} disabled={isDeleteBusy}>
              Delete
            </Button>
          )}
        </Flex>
      </Flex>
    </Card>
  );
}
