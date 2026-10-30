import { downloadUpscaleModel } from "../../../../services/playground";
import { usePlaygroundStore } from "../../../../stores/playgroundStore";
import type { UpscaleModel } from "../../../../types";
import { formatBytes } from "../../../../utils/format";
import { deleteModelMessage, deleteModelTitle } from "../../../../utils/playgroundText";
import { UPSCALE_BEST_FOR_LABEL } from "../../../../utils/upscaleText";
import { ConfirmDialog } from "../../../ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../../../ui/Flex/Flex";
import { PlaygroundModelCard } from "../../PlaygroundModelCard/PlaygroundModelCard";
import { usePlaygroundModelActions } from "../../usePlaygroundModelActions";
import { useUpscaleModelDelete } from "../useUpscaleModelDelete";
import "./UpscaleModelColumn.css";

interface UpscaleModelColumnProps {
  models: UpscaleModel[];
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
}

/** The upscaling models as cards, on the left of the tab. Downloads and deletes run from here. */
export function UpscaleModelColumn({ models, selectedModelId, onSelect }: UpscaleModelColumnProps) {
  const job = usePlaygroundStore((s) => s.job);
  const downloads = usePlaygroundStore((s) => s.downloads);
  const { download, cancel } = usePlaygroundModelActions(downloadUpscaleModel);
  const { pendingModel, deletingModelId, requestDelete, cancelDelete, confirmDelete } =
    useUpscaleModelDelete();

  const isAnyDownloading = Object.values(downloads).some((d) => d.status === "downloading");

  return (
    <Flex direction="column" gap="m" className="upscale-model-column">
      {models.map((model) => (
        <PlaygroundModelCard
          key={model.id}
          model={model}
          sizeBytes={model.sizeBytes}
          details={[{ label: UPSCALE_BEST_FOR_LABEL, value: model.bestFor }]}
          isSelected={model.id === selectedModelId}
          download={downloads[model.id]}
          isOtherDownloading={isAnyDownloading}
          onSelect={() => onSelect(model.id)}
          onDownload={() => download(model.id)}
          isDeleteBusy={deletingModelId === model.id || job?.modelId === model.id}
          onCancelDownload={() => cancel(model.id)}
          onDelete={() => requestDelete(model)}
        />
      ))}
      {pendingModel && (
        <ConfirmDialog
          title={deleteModelTitle(pendingModel.name)}
          message={deleteModelMessage(formatBytes(pendingModel.sizeBytes))}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </Flex>
  );
}
