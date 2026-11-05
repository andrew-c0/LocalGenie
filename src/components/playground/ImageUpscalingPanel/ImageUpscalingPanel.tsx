import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { SD_CPP_NAME, SD_CPP_RUNTIME_ID } from "../../../utils/playground";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import {
  buildUpscaleRequest,
  jobOfKind,
  oversizedInputWarning,
  resultOfKind,
  upscaleBlockedReason,
} from "../../../utils/upscale";
import { UPSCALE_RUNTIME_PURPOSE, UPSCALE_SECTION_TITLE } from "../../../utils/upscaleText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { newImageJobId, useImageGeneration } from "../ImageGeneration/useImageGeneration";
import { useInputImagePicker } from "../ImageToImagePanel/InputImagePicker/useInputImagePicker";
import { PickModelHint } from "../PickModelHint/PickModelHint";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { UpscaleCompareToggle } from "./UpscaleCompareToggle";
import { UpscaleForm } from "./UpscaleForm";
import { UpscaleScale } from "./UpscaleScale";
import { UpscaleStage } from "./UpscaleStage/UpscaleStage";
import { useUpscale } from "./useUpscale";
import { useUpscaleStage } from "./useUpscaleStage";

/**
 * Image upscaling (CPU only): one card with the picture picker, the fixed 4x note and Upscale, and below them the
 * stage that shows the input, the running job or the result. The upscaling model is picked in the header's selector.
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
  const stage = useUpscaleStage(input, lastResult);

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
                <UpscaleCompareToggle
                  checked={stage.comparing}
                  disabled={!stage.compareReady}
                  onToggle={stage.toggleCompare}
                />
              )}
            </Flex>
          }
        >
          <Flex direction="column" gap="m">
            <UpscaleStage
              input={input}
              job={job}
              stage={stage}
              onCancel={cancel}
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
