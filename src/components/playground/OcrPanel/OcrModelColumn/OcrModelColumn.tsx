import { downloadOcrModel } from "../../../../services/playground";
import { useOcrStore } from "../../../../stores/ocrStore";
import { usePlaygroundStore } from "../../../../stores/playgroundStore";
import type { OcrModel } from "../../../../types";
import { formatBytes } from "../../../../utils/format";
import { OCR_BEST_FOR_LABEL } from "../../../../utils/ocrText";
import { deleteModelMessage, deleteModelTitle } from "../../../../utils/playgroundText";
import { ConfirmDialog } from "../../../ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../../../ui/Flex/Flex";
import { PlaygroundModelCard } from "../../PlaygroundModelCard/PlaygroundModelCard";
import { usePlaygroundModelActions } from "../../usePlaygroundModelActions";
import { useOcrModelDelete } from "../useOcrModelDelete";
import "./OcrModelColumn.css";

interface OcrModelColumnProps {
  models: OcrModel[];
  selectedModelId: string | null;
  onSelect: (modelId: string) => void;
}

/** The OCR models as cards, on the left of the tab. Downloads and deletes run from here. */
export function OcrModelColumn({ models, selectedModelId, onSelect }: OcrModelColumnProps) {
  const job = useOcrStore((s) => s.job);
  const downloads = usePlaygroundStore((s) => s.downloads);
  const { download, cancel } = usePlaygroundModelActions(downloadOcrModel);
  const { pendingModel, deletingModelId, requestDelete, cancelDelete, confirmDelete } =
    useOcrModelDelete();

  const isAnyDownloading = Object.values(downloads).some((d) => d.status === "downloading");

  return (
    <Flex direction="column" gap="m" className="ocr-model-column">
      {models.map((model) => (
        <PlaygroundModelCard
          key={model.id}
          model={model}
          sizeBytes={model.sizeBytes}
          details={[{ label: OCR_BEST_FOR_LABEL, value: model.bestFor }]}
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
