import { useModelCapabilityBadges } from "../../hooks/useModelCapabilityBadges";
import type { DbDownloadedModel } from "../../services/database";
import type { ModelInfo } from "../../types";
import { ModelCard } from "../ui/ModelCard/ModelCard";
import { localCardData } from "../ui/ModelCard/modelCardData";

interface LocalModelCardProps {
  model: ModelInfo;
  /** The downloaded-model row for this model, when the database has one. */
  stored: DbDownloadedModel | undefined;
  isLoaded: boolean;
  isDownloading: boolean;
  onOpenSelector: () => void;
  onRemove: (name: string) => void;
  onDetails: (name: string, isLocal: boolean) => void;
}

/**
 * Card of an installed model. Its capability icons come from the stored scan, which is read per card,
 * so this wrapper exists: a hook cannot run inside the list's map.
 */
export function LocalModelCard({
  model,
  stored,
  isLoaded,
  isDownloading,
  onOpenSelector,
  onRemove,
  onDetails,
}: LocalModelCardProps) {
  const capabilityBadges = useModelCapabilityBadges(model.name);
  return (
    <ModelCard
      model={localCardData(model, stored, capabilityBadges)}
      isLoaded={isLoaded}
      isDownloading={isDownloading}
      isLocal
      onOpenSelector={onOpenSelector}
      onRemove={onRemove}
      onDetails={onDetails}
    />
  );
}
