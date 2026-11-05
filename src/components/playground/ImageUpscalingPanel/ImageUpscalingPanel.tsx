import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { SD_CPP_NAME, SD_CPP_RUNTIME_ID } from "../../../utils/playground";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import { resultForInput } from "../../../utils/resultStage";
import {
  buildUpscaleRequest,
  jobOfKind,
  oversizedInputWarning,
  resultOfKind,
  upscaleBlockedReason,
} from "../../../utils/upscale";
import {
  UPSCALE_RESULT_COPY,
  UPSCALE_RUNTIME_PURPOSE,
  UPSCALE_SECTION_TITLE,
  UPSCALE_STAGE_EMPTY_MESSAGE,
} from "../../../utils/upscaleText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { CompareToggle } from "../CompareToggle/CompareToggle";
import { newImageJobId, useImageGeneration } from "../ImageGeneration/useImageGeneration";
import { useInputImagePicker } from "../ImageToImagePanel/InputImagePicker/useInputImagePicker";
import { PickModelHint } from "../PickModelHint/PickModelHint";
import { PictureStage } from "../PictureStage/PictureStage";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { useResultStage } from "../useResultStage";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { UpscaleForm } from "./UpscaleForm";
import { UpscaleProgress } from "./UpscaleProgress/UpscaleProgress";
import { UpscaleScale } from "./UpscaleScale";
import { useUpscale } from "./useUpscale";

/**
 * Image upscaling (CPU only): one card with the picture stage on top and the controls below it. The upscaling model
 * is picked in the header's selector.
 */
export default function ImageUpscalingPanel() {
  const runtime = useRuntimeCheck(SD_CPP_RUNTIME_ID);
  const upscale = useUpscale();
  const { cancel } = useImageGeneration();

  const models = usePlaygroundStore((s) => s.upscaleModels);
  const selectedModelId = usePlaygroundStore((s) => s.upscaleModelId);
  const input = usePlaygroundStore((s) => s.upscaleInput);
  const setInput = usePlaygroundStore((s) => s.setUpscaleInput);
  const setInputSize = usePlaygroundStore((s) => s.setUpscaleInputSize);
  const clearInput = usePlaygroundStore((s) => s.clearUpscaleInput);
  const anyJob = usePlaygroundStore((s) => s.job);
  const job = jobOfKind(anyJob, "upscale");
  const lastResult = resultOfKind(
    usePlaygroundStore((s) => s.result),
    "upscale",
  );
  const picker = useInputImagePicker(setInput);
  const stage = useResultStage(resultForInput(lastResult, input));

  const selected = models?.find((m) => m.id === selectedModelId) ?? null;
  const blockedReason = upscaleBlockedReason({
    runtime: runtime.status,
    model: selected,
    inputPath: input?.path ?? null,
    jobRunning: anyJob !== null,
  });

  const start = () => {
    if (!selected || !input) return;
    upscale(buildUpscaleRequest(newImageJobId(), selected, input.path));
  };

  return (
    <Flex direction="column" gap="l">
      {runtime.status === "missing" && (
        <RuntimeNotice message={runtimeMissingMessage(UPSCALE_RUNTIME_PURPOSE, SD_CPP_NAME)} />
      )}
      {runtime.error && <ErrorBanner message={runtime.error} />}

      {models && selected === null && <PickModelHint />}

      {models && (
        <SurfaceCard
          title={UPSCALE_SECTION_TITLE}
          action={
            <Flex gap="m" align="center">
              <UpscaleScale />
              {stage.pictureShown && (
                <CompareToggle
                  checked={stage.comparing}
                  disabled={!stage.compareReady}
                  onToggle={stage.toggleCompare}
                />
              )}
            </Flex>
          }
        >
          <Flex direction="column" gap="m">
            <PictureStage
              input={input}
              jobRunning={job !== null}
              progress={job && <UpscaleProgress job={job} onCancel={cancel} />}
              emptyMessage={UPSCALE_STAGE_EMPTY_MESSAGE}
              copy={UPSCALE_RESULT_COPY}
              stage={stage}
              onSourceSize={setInputSize}
            />
            <UpscaleForm
              input={input}
              pickerError={picker.error}
              jobRunning={job !== null}
              sizeWarning={oversizedInputWarning(input?.sourceSize ?? null)}
              blockedReason={blockedReason}
              onChoose={picker.chooseFile}
              onSourceSize={setInputSize}
              onUpscale={start}
              upscaled={stage.pictureShown ? stage.result : null}
              onClear={clearInput}
            />
          </Flex>
        </SurfaceCard>
      )}
    </Flex>
  );
}
