import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { generateBlockedReason } from "../../../utils/playground";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import GeneratedImage from "./GeneratedImage/GeneratedImage";
import GenerateForm from "./GenerateForm/GenerateForm";
import GenerationProgress from "./GenerationProgress/GenerationProgress";
import ImageModelCard from "./ImageModelCard/ImageModelCard";
import { ImageModelDeleteDialog } from "./ImageModelDeleteDialog/ImageModelDeleteDialog";
import { RuntimeNotice } from "./RuntimeNotice/RuntimeNotice";
import { useComputeDevices } from "./useComputeDevices";
import { useImageGeneration } from "./useImageGeneration";
import { useImageModelActions } from "./useImageModelActions";
import { useImageModelDelete } from "./useImageModelDelete";
import { useImageModels } from "./useImageModels";
import { useSdCppRuntime } from "./useSdCppRuntime";
import "./TextToImagePanel.css";

/** Text to image: the model list on the left; the form, the running image and the last result on the right. */
export default function TextToImagePanel() {
  const { models, loadError } = useImageModels();
  const runtime = useSdCppRuntime();
  const { download, cancel: cancelDownload } = useImageModelActions();
  const { generate, cancel: cancelJob } = useImageGeneration();
  const compute = useComputeDevices(runtime.status);
  const { pendingModel, deletingModelId, requestDelete, cancelDelete, confirmDelete } =
    useImageModelDelete();

  const selectedModelId = usePlaygroundStore((s) => s.selectedModelId);
  const selectModel = usePlaygroundStore((s) => s.selectModel);
  const form = usePlaygroundStore((s) => s.form);
  const setForm = usePlaygroundStore((s) => s.setForm);
  const applySeed = usePlaygroundStore((s) => s.applySeed);
  const downloads = usePlaygroundStore((s) => s.downloads);
  const job = usePlaygroundStore((s) => s.job);
  const result = usePlaygroundStore((s) => s.result);

  const selected = models?.find((m) => m.id === selectedModelId) ?? null;
  const isAnyDownloading = Object.values(downloads).some((d) => d.status === "downloading");
  const blockedReason = generateBlockedReason({
    runtime: runtime.status,
    model: selected,
    prompt: form.prompt,
    jobRunning: job !== null,
  });

  return (
    <Flex direction="column" gap="l">
      {runtime.status === "missing" && <RuntimeNotice />}
      {runtime.error && <ErrorBanner message={runtime.error} />}
      {loadError && <ErrorBanner message={loadError} />}
      {!models && !loadError && <StateBlock message="Reading image models…" />}

      {models && (
        <Flex gap="l" align="start">
          <Flex direction="column" gap="m" className="text-to-image__models">
            {models.map((model) => (
              <ImageModelCard
                key={model.id}
                model={model}
                isSelected={model.id === selectedModelId}
                download={downloads[model.id]}
                isOtherDownloading={isAnyDownloading}
                onSelect={() => selectModel(model)}
                onDownload={() => download(model)}
                isDeleteBusy={deletingModelId === model.id || job?.modelId === model.id}
                onCancelDownload={() => cancelDownload(model.id)}
                onDelete={() => requestDelete(model)}
              />
            ))}
            {pendingModel && (
              <ImageModelDeleteDialog
                model={pendingModel}
                models={models}
                onConfirm={confirmDelete}
                onCancel={cancelDelete}
              />
            )}
          </Flex>

          <Flex direction="column" gap="l" className="flex-grow">
            <SurfaceCard title="Generate">
              <GenerateForm
                form={form}
                model={selected}
                onChange={setForm}
                blockedReason={blockedReason}
                compute={compute}
                onGenerate={() => {
                  if (selected) generate(selected, form);
                }}
              />
            </SurfaceCard>
            {job && <GenerationProgress job={job} onCancel={cancelJob} />}
            {result && (
              <GeneratedImage result={result} devices={compute.devices} onUseSeed={applySeed} />
            )}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
