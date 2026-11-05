import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { inputFileName } from "../../../utils/imageToImage";
import {
  buildImageRequest,
  generateBlockedReason,
  SD_CPP_NAME,
  SD_CPP_RUNTIME_ID,
} from "../../../utils/playground";
import {
  GENERATE_PROGRESS_LABEL,
  GENERATE_RESULT_COPY,
  GENERATE_SECTION_TITLE,
  runtimeMissingMessage,
  TEXT_STAGE_EMPTY_MESSAGE,
} from "../../../utils/playgroundText";
import { textResultOf } from "../../../utils/resultStage";
import { jobOfKind, resultOfKind } from "../../../utils/upscale";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { ImageJobProgress } from "../ImageGeneration/ImageJobProgress/ImageJobProgress";
import { newImageJobId, useImageGeneration } from "../ImageGeneration/useImageGeneration";
import { PickModelHint } from "../PickModelHint/PickModelHint";
import { PictureStage } from "../PictureStage/PictureStage";
import { ResolutionPopover } from "../ResolutionPopover/ResolutionPopover";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { useResultStage } from "../useResultStage";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { GenerateControls } from "./GenerateControls/GenerateControls";
import GenerateForm from "./GenerateForm/GenerateForm";

interface TextToImagePanelProps {
  /** Opens the image to image tab, once a result has been sent there as its input. */
  onOpenImageToImage: () => void;
}

/**
 * Text to image: one card with the picture stage on top (the running job or the last result), then the prompt and the
 * settings, then the controls. The model is picked in the header's selector.
 */
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
  const lastResult = resultOfKind(
    usePlaygroundStore((s) => s.result),
    "generate",
  );
  const stage = useResultStage(textResultOf(lastResult));

  const selected = models?.find((m) => m.id === selectedModelId) ?? null;
  const blockedReason = generateBlockedReason({
    runtime: runtime.status,
    model: selected,
    prompt: form.prompt,
    jobRunning: job !== null,
  });
  const shownResult = stage.pictureShown ? stage.result : null;

  const startGenerate = () => {
    if (selected) generate(buildImageRequest(newImageJobId(), selected, form), form, null);
  };

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
        <SurfaceCard
          title={GENERATE_SECTION_TITLE}
          action={
            <ResolutionPopover
              width={form.width}
              height={form.height}
              nativeSize={selected?.defaults ?? null}
              onChange={setForm}
            />
          }
        >
          <Flex direction="column" gap="m">
            <PictureStage
              input={null}
              jobRunning={job !== null}
              progress={
                job && (
                  <ImageJobProgress
                    job={job}
                    label={GENERATE_PROGRESS_LABEL}
                    onCancel={cancelJob}
                  />
                )
              }
              emptyMessage={TEXT_STAGE_EMPTY_MESSAGE}
              copy={GENERATE_RESULT_COPY}
              stage={stage}
            />
            {job === null && <GenerateForm form={form} model={selected} onChange={setForm} />}
            {job === null && (
              <GenerateControls
                result={shownResult}
                blockedReason={blockedReason}
                devices={devices}
                onGenerate={startGenerate}
                onUseSeed={applySeed}
                onUseAsInput={useResultAsInput}
              />
            )}
          </Flex>
        </SurfaceCard>
      )}
    </Flex>
  );
}
