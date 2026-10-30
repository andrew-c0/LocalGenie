import { downloadSpeechModel, listSpeechModels } from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { useSpeechStore } from "../../../stores/speechStore";
import type { SpeechKind, SpeechModel } from "../../../types";
import { formatBytes } from "../../../utils/format";
import { deleteModelMessage, deleteModelTitle } from "../../../utils/playgroundText";
import { speechModelsOfKind } from "../../../utils/speech";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import type { ModelDetail } from "../PlaygroundModelCard/PlaygroundModelCard";
import { PlaygroundModelCard } from "../PlaygroundModelCard/PlaygroundModelCard";
import { useModelCatalog } from "../useModelCatalog";
import { usePlaygroundModelActions } from "../usePlaygroundModelActions";
import { useSpeechModelDelete } from "./useSpeechModelDelete";
import "./SpeechModelColumn.css";

/**
 * The lines a speech card shows beyond the common ones: the languages when the model names any (the
 * audio to audio models name none), and for speech synthesis the voice count.
 */
function speechModelDetails(model: SpeechModel): ModelDetail[] {
  const details: ModelDetail[] = [];
  if (model.languages.length > 0) {
    details.push({ label: "Languages", value: model.languages.join(", ") });
  }
  if (model.kind === "tts") {
    details.push({ label: "Voices", value: String(model.voices.length) });
  }
  return details;
}

interface SpeechModelColumnProps {
  /** Which tab's models the column lists. */
  kind: SpeechKind;
}

/** The speech models of one tab as cards, on the left of the tab. The catalog is read when the column mounts. */
export function SpeechModelColumn({ kind }: SpeechModelColumnProps) {
  const models = useSpeechStore((s) => s.models);
  const setModels = useSpeechStore((s) => s.setModels);
  const loadError = useModelCatalog(
    listSpeechModels,
    setModels,
    "Could not read the speech models.",
  );
  const selectedModelId = useSpeechStore((s) => s.selectedModelIds[kind]);
  const selectModel = useSpeechStore((s) => s.selectModel);
  const job = useSpeechStore((s) => s.job);
  const downloads = usePlaygroundStore((s) => s.downloads);
  const { download, cancel } = usePlaygroundModelActions(downloadSpeechModel);
  const { pendingModel, deletingModelId, requestDelete, cancelDelete, confirmDelete } =
    useSpeechModelDelete();

  if (loadError) return <ErrorBanner message={loadError} />;
  if (!models) return <StateBlock message="Reading speech models…" />;

  const isAnyDownloading = Object.values(downloads).some((d) => d.status === "downloading");

  return (
    <Flex direction="column" gap="m" className="speech-model-column">
      {speechModelsOfKind(models, kind).map((model) => (
        <PlaygroundModelCard
          key={model.id}
          model={model}
          sizeBytes={model.sizeBytes}
          details={speechModelDetails(model)}
          isSelected={model.id === selectedModelId}
          download={downloads[model.id]}
          isOtherDownloading={isAnyDownloading}
          onSelect={() => selectModel(model)}
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
