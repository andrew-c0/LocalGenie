import { usePlaygroundStore } from "../../../stores/playgroundStore";
import { SD_CPP_NAME, SD_CPP_RUNTIME_ID } from "../../../utils/playground";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import {
  buildUpscaleRequest,
  jobOfKind,
  oversizedInputWarning,
  resultOfKind,
  UPSCALE_FACTOR,
  upscaleBlockedReason,
} from "../../../utils/upscale";
import {
  UPSCALE_ACTION_LABEL,
  UPSCALE_CPU_NOTE,
  UPSCALE_FACTOR_NOTE,
  UPSCALE_INPUT_HINT,
  UPSCALE_LOADING_MODELS,
  UPSCALE_RUNTIME_PURPOSE,
  UPSCALE_SECTION_TITLE,
} from "../../../utils/upscaleText";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { Body, Meta } from "../../ui/Typography/Typography";
import { GenerateFooter } from "../ImageGeneration/GenerateFooter/GenerateFooter";
import { newImageJobId, useImageGeneration } from "../ImageGeneration/useImageGeneration";
import { InputImagePicker } from "../ImageToImagePanel/InputImagePicker/InputImagePicker";
import { useInputImagePicker } from "../ImageToImagePanel/InputImagePicker/useInputImagePicker";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { UpscaleModelColumn } from "./UpscaleModelColumn/UpscaleModelColumn";
import { UpscaleProgress } from "./UpscaleProgress/UpscaleProgress";
import { UpscaleResult } from "./UpscaleResult/UpscaleResult";
import { useUpscale } from "./useUpscale";
import { useUpscaleModels } from "./useUpscaleModels";

/**
 * Image upscaling (CPU only): the upscaling models on the left; the input picture, the fixed 4x note,
 * the running job and the result beside its input on the right.
 */
export default function ImageUpscalingPanel() {
  const { models, loadError } = useUpscaleModels();
  const runtime = useRuntimeCheck(SD_CPP_RUNTIME_ID);
  const upscale = useUpscale();
  const { cancel } = useImageGeneration();

  const selectedModelId = usePlaygroundStore((s) => s.upscaleModelId);
  const selectModel = usePlaygroundStore((s) => s.selectUpscaleModel);
  const input = usePlaygroundStore((s) => s.upscaleInput);
  const setInput = usePlaygroundStore((s) => s.setUpscaleInput);
  const setInputSize = usePlaygroundStore((s) => s.setUpscaleInputSize);
  const anyJob = usePlaygroundStore((s) => s.job);
  const job = jobOfKind(anyJob, "upscale");
  const result = resultOfKind(
    usePlaygroundStore((s) => s.result),
    "upscale",
  );
  const picker = useInputImagePicker(setInput);

  const selected = models?.find((m) => m.id === selectedModelId) ?? null;
  const blockedReason = upscaleBlockedReason({
    runtime: runtime.status,
    model: selected,
    inputPath: input?.path ?? null,
    jobRunning: anyJob !== null,
  });
  const sizeWarning = oversizedInputWarning(input?.sourceSize ?? null);

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
      {loadError && <ErrorBanner message={loadError} />}
      {!models && !loadError && <StateBlock message={UPSCALE_LOADING_MODELS} />}

      {models && (
        <Flex gap="l" align="start">
          <UpscaleModelColumn
            models={models}
            selectedModelId={selectedModelId}
            onSelect={selectModel}
          />

          <Flex direction="column" gap="l" className="flex-grow">
            <SurfaceCard title={UPSCALE_SECTION_TITLE}>
              <Flex direction="column" gap="m">
                <InputImagePicker
                  input={input}
                  error={picker.error}
                  disabled={job !== null}
                  hint={UPSCALE_INPUT_HINT}
                  onChoose={picker.chooseFile}
                  onSourceSize={setInputSize}
                />
                {sizeWarning && <ErrorBanner message={sizeWarning} />}
                <Body>Scale: {UPSCALE_FACTOR}x</Body>
                <Meta>{UPSCALE_FACTOR_NOTE}</Meta>
                <GenerateFooter
                  onGenerate={start}
                  blockedReason={blockedReason}
                  actionLabel={UPSCALE_ACTION_LABEL}
                  note={UPSCALE_CPU_NOTE}
                />
              </Flex>
            </SurfaceCard>
            {job && <UpscaleProgress job={job} onCancel={cancel} />}
            {result && <UpscaleResult result={result} />}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
