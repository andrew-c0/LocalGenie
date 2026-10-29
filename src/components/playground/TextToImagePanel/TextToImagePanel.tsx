import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { inputFileName } from "../../../utils/imageToImage";
import {
  buildImageRequest,
  generateBlockedReason,
  SD_CPP_NAME,
  SD_CPP_RUNTIME_ID,
} from "../../../utils/playground";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import GeneratedImage from "../ImageGeneration/GeneratedImage/GeneratedImage";
import GenerationProgress from "../ImageGeneration/GenerationProgress/GenerationProgress";
import { useComputeDevices } from "../ImageGeneration/useComputeDevices";
import { newImageJobId, useImageGeneration } from "../ImageGeneration/useImageGeneration";
import { ImageModelColumn } from "../ImageModels/ImageModelColumn/ImageModelColumn";
import { useImageModels } from "../ImageModels/useImageModels";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { useRuntimeCheck } from "../useRuntimeCheck";
import GenerateForm from "./GenerateForm/GenerateForm";

interface TextToImagePanelProps {
  /** Opens the image to image tab, once a result has been sent there as its input. */
  onOpenImageToImage: () => void;
}

/** Text to image: the model list on the left; the form, the running image and the last result on the right. */
export default function TextToImagePanel({ onOpenImageToImage }: TextToImagePanelProps) {
  const { models, loadError } = useImageModels();
  const runtime = useRuntimeCheck(SD_CPP_RUNTIME_ID);
  const { generate, cancel: cancelJob } = useImageGeneration();
  const compute = useComputeDevices(runtime.status);

  const selectedModelId = usePlaygroundStore((s) => s.selectedModelId);
  const selectModel = usePlaygroundStore((s) => s.selectModel);
  const form = usePlaygroundStore((s) => s.form);
  const setForm = usePlaygroundStore((s) => s.setForm);
  const applySeed = usePlaygroundStore((s) => s.applySeed);
  const setInputImage = usePlaygroundStore((s) => s.setInputImage);
  const job = usePlaygroundStore((s) => s.job);
  const result = usePlaygroundStore((s) => s.result);

  const selected = models?.find((m) => m.id === selectedModelId) ?? null;
  const blockedReason = generateBlockedReason({
    runtime: runtime.status,
    model: selected,
    prompt: form.prompt,
    jobRunning: job !== null,
  });
  // The image to image tab shows its own results, so this tab shows only the text to image ones.
  const textResult = result?.inputPath ? null : result;

  const useResultAsInput = (path: string) => {
    setInputImage({ path, name: inputFileName(path), sourceSize: null });
    onOpenImageToImage();
  };

  return (
    <Flex direction="column" gap="l">
      {runtime.status === "missing" && (
        <RuntimeNotice message={runtimeMissingMessage("Image generation", SD_CPP_NAME)} />
      )}
      {runtime.error && <ErrorBanner message={runtime.error} />}
      {loadError && <ErrorBanner message={loadError} />}
      {!models && !loadError && <StateBlock message="Reading image models…" />}

      {models && (
        <Flex gap="l" align="start">
          <ImageModelColumn
            models={models}
            catalog={models}
            selectedModelId={selectedModelId}
            onSelect={selectModel}
          />

          <Flex direction="column" gap="l" className="flex-grow">
            <SurfaceCard title="Generate">
              <GenerateForm
                form={form}
                model={selected}
                onChange={setForm}
                blockedReason={blockedReason}
                compute={compute}
                onGenerate={() => {
                  if (selected)
                    generate(buildImageRequest(newImageJobId(), selected, form), form, null);
                }}
              />
            </SurfaceCard>
            {job && <GenerationProgress job={job} onCancel={cancelJob} />}
            {textResult && (
              <GeneratedImage
                result={textResult}
                devices={compute.devices}
                onUseSeed={applySeed}
                onUseAsInput={useResultAsInput}
              />
            )}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
