import type { ReactNode } from "react";
import { downloadImageModel } from "../../../../services/playground";
import { usePlaygroundStore } from "../../../../stores/playgroundStore";
import type { ImageModel } from "../../../../types";
import { Flex } from "../../../ui/Flex/Flex";
import { PlaygroundModelCard } from "../../PlaygroundModelCard/PlaygroundModelCard";
import { usePlaygroundModelActions } from "../../usePlaygroundModelActions";
import { ImageModelDeleteDialog } from "../ImageModelDeleteDialog/ImageModelDeleteDialog";
import { useImageModelDelete } from "../useImageModelDelete";
import "./ImageModelColumn.css";

interface ImageModelColumnProps {
  /** The models this tab lists, in catalog order. */
  models: ImageModel[];
  /** Every image model. A delete counts only the files no other model uses, so it reads the whole list. */
  catalog: ImageModel[];
  selectedModelId: string | null;
  onSelect: (model: ImageModel) => void;
  /** A badge for a card, e.g. how the model uses an input picture. Null or undefined for none. */
  tagFor?: (model: ImageModel) => ReactNode;
}

/** The image models of one tab as cards, on the left of the tab. Downloads and deletes run from here. */
export function ImageModelColumn({
  models,
  catalog,
  selectedModelId,
  onSelect,
  tagFor,
}: ImageModelColumnProps) {
  const job = usePlaygroundStore((s) => s.job);
  const downloads = usePlaygroundStore((s) => s.downloads);
  const { download, cancel } = usePlaygroundModelActions(downloadImageModel);
  const { pendingModel, deletingModelId, requestDelete, cancelDelete, confirmDelete } =
    useImageModelDelete();

  const isAnyDownloading = Object.values(downloads).some((d) => d.status === "downloading");

  return (
    <Flex direction="column" gap="m" className="image-model-column">
      {models.map((model) => (
        <PlaygroundModelCard
          key={model.id}
          model={model}
          sizeBytes={model.totalBytes}
          tag={tagFor?.(model)}
          isSelected={model.id === selectedModelId}
          download={downloads[model.id]}
          isOtherDownloading={isAnyDownloading}
          onSelect={() => onSelect(model)}
          onDownload={() => download(model.id)}
          isDeleteBusy={deletingModelId === model.id || job?.modelId === model.id}
          onCancelDownload={() => cancel(model.id)}
          onDelete={() => requestDelete(model)}
        />
      ))}
      {pendingModel && (
        <ImageModelDeleteDialog
          model={pendingModel}
          models={catalog}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </Flex>
  );
}
