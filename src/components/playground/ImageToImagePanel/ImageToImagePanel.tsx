import { usePlaygroundStore } from "../../../stores/playgroundStore";
import {
  buildEditRequest,
  editBlockedReason,
  imageToImageModels,
  inputFileName,
} from "../../../utils/imageToImage";
import {
  EDIT_RESULT_COPY,
  EDIT_SECTION_TITLE,
  EDIT_STAGE_EMPTY_MESSAGE,
} from "../../../utils/imageToImageText";
import { SD_CPP_NAME, SD_CPP_RUNTIME_ID } from "../../../utils/playground";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import { jobOfKind, resultOfKind } from "../../../utils/upscale";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import { newImageJobId, useImageGeneration } from "../ImageGeneration/useImageGeneration";
import { PickModelHint } from "../PickModelHint/PickModelHint";
import { PictureStage } from "../PictureStage/PictureStage";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { useResultStage } from "../useResultStage";
import { useRuntimeCheck } from "../useRuntimeCheck";
import { EditControls } from "./EditControls/EditControls";
import { EditHeaderAction } from "./EditHeaderAction";
import { EditProgress } from "./EditProgress/EditProgress";
import { EditSettings } from "./EditSettings/EditSettings";
import { useInputImagePicker } from "./InputImagePicker/useInputImagePicker";

/**
 * Image to image: one card with the edit stage on top (the input picture, the running edit or the result) and the
 * prompts, settings and controls below it. The models that take a picture are picked in the header's selector.
 */
export default function ImageToImagePanel() {
  const runtime = useRuntimeCheck(SD_CPP_RUNTIME_ID);
  const { generate, cancel: cancelJob } = useImageGeneration();
  const setInputImage = usePlaygroundStore((s) => s.setInputImage);
  const clearInputImage = usePlaygroundStore((s) => s.clearInputImage);
  const inputPicker = useInputImagePicker(setInputImage);

  const models = usePlaygroundStore((s) => s.models);
  const devices = usePlaygroundStore((s) => s.devices);
  const selectedModelId = usePlaygroundStore((s) => s.selectedModelId);
  const form = usePlaygroundStore((s) => s.form);
  const setForm = usePlaygroundStore((s) => s.setForm);
  const applySeed = usePlaygroundStore((s) => s.applySeed);
  const inputImage = usePlaygroundStore((s) => s.inputImage);
  const setInputSourceSize = usePlaygroundStore((s) => s.setInputSourceSize);
  const strength = usePlaygroundStore((s) => s.strength);
  const setStrength = usePlaygroundStore((s) => s.setStrength);
  const job = jobOfKind(
    usePlaygroundStore((s) => s.job),
    "generate",
  );
  const lastResult = resultOfKind(
    usePlaygroundStore((s) => s.result),
    "generate",
  );
  const stage = useResultStage(inputImage, lastResult);

  const editModels = models ? imageToImageModels(models) : null;
  const selected = editModels?.find((m) => m.id === selectedModelId) ?? null;
  const blockedReason = editBlockedReason({
    runtime: runtime.status,
    model: selected,
    inputPath: inputImage?.path ?? null,
    prompt: form.prompt,
    jobRunning: job !== null,
  });
  const shownResult = stage.pictureShown ? stage.result : null;

  const startEdit = () => {
    if (!selected || !inputImage) return;
    const request = buildEditRequest(newImageJobId(), selected, form, inputImage.path, strength);
    generate(request, form, inputImage.path);
  };

  const useResultAsInput = (path: string) => {
    setInputImage({ path, name: inputFileName(path), sourceSize: null });
  };

  return (
    <Flex direction="column" gap="l">
      {runtime.status === "missing" && (
        <RuntimeNotice message={runtimeMissingMessage("Image editing", SD_CPP_NAME)} />
      )}
      {runtime.error && <ErrorBanner message={runtime.error} />}

      {editModels && selected === null && <PickModelHint />}

      {models && (
        <SurfaceCard
          title={EDIT_SECTION_TITLE}
          action={
            <EditHeaderAction
              width={form.width}
              height={form.height}
              nativeSize={selected?.defaults ?? null}
              onSizeChange={setForm}
              pictureShown={stage.pictureShown}
              comparing={stage.comparing}
              compareReady={stage.compareReady}
              onToggleCompare={stage.toggleCompare}
            />
          }
        >
          <Flex direction="column" gap="m">
            <PictureStage
              input={inputImage}
              jobRunning={job !== null}
              progress={job && <EditProgress job={job} onCancel={cancelJob} />}
              emptyMessage={EDIT_STAGE_EMPTY_MESSAGE}
              copy={EDIT_RESULT_COPY}
              stage={stage}
              onSourceSize={setInputSourceSize}
            />
            {shownResult === null && job === null && (
              <EditSettings
                form={form}
                model={selected}
                strength={strength}
                onChange={setForm}
                onStrengthChange={setStrength}
              />
            )}
            {job === null && (
              <EditControls
                input={inputImage}
                pickerError={inputPicker.error}
                jobRunning={job !== null}
                blockedReason={blockedReason}
                result={shownResult}
                devices={devices}
                onChoose={inputPicker.chooseFile}
                onSourceSize={setInputSourceSize}
                onGenerate={startEdit}
                onUseAsInput={useResultAsInput}
                onUseSeed={applySeed}
                onClear={clearInputImage}
              />
            )}
          </Flex>
        </SurfaceCard>
      )}
    </Flex>
  );
}
