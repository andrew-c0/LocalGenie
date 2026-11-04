import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { inputFileName } from "../../../utils/imageToImage";
import {
  buildImageRequest,
  generateBlockedReason,
  SD_CPP_NAME,
  SD_CPP_RUNTIME_ID,
} from "../../../utils/playground";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import { jobOfKind, resultOfKind } from "../../../utils/upscale";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import GeneratedImage from "../ImageGeneration/GeneratedImage/GeneratedImage";
import GenerationProgress from "../ImageGeneration/GenerationProgress/GenerationProgress";
import { newImageJobId, useImageGeneration } from "../ImageGeneration/useImageGeneration";
import { PickModelHint } from "../PickModelHint/PickModelHint";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { useRuntimeCheck } from "../useRuntimeCheck";
import GenerateForm from "./GenerateForm/GenerateForm";

interface TextToImagePanelProps {
  /** Opens the image to image tab, once a result has been sent there as its input. */
  onOpenImageToImage: () => void;
}

/** Text to image: the form, the running image and the last result. The model is picked in the header's selector. */
export default function TextToImagePanel({ onOpenImageToImage }: TextToImagePanelProps) {
  const runtime = useRuntimeCheck(SD_CPP_RUNTIME_ID);
  const { generate, cancel: cancelJob } = useImageGeneration();

  const models = usePlaygroundStore((s) => s.models);
  const devices = usePlaygroundStore((s) => s.devices);
  const selectedModelId = usePlaygroundStore((s) => s.selectedModelId);
  const form = usePlaygroundStore((s) => s.form);
  const setForm = usePlaygroundStore((s) => s.setForm);
  const applySeed = usePlaygroundStore((s) => s.applySeed);
  const setInputImage = usePlaygroundStore((s) => s.setInputImage);
  const job = jobOfKind(
    usePlaygroundStore((s) => s.job),
    "generate",
  );
  const result = resultOfKind(
    usePlaygroundStore((s) => s.result),
    "generate",
  );

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

      {models && selected === null && <PickModelHint />}

      {models && (
        <>
          <SurfaceCard title="Generate">
            <GenerateForm
              form={form}
              model={selected}
              onChange={setForm}
              blockedReason={blockedReason}
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
              devices={devices}
              onUseSeed={applySeed}
              onUseAsInput={useResultAsInput}
            />
          )}
        </>
      )}
    </Flex>
  );
}
