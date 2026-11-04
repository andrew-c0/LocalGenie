import { usePlaygroundStore } from "../../../stores/playgroundStore";
import {
  buildEditRequest,
  editBlockedReason,
  imageToImageModels,
} from "../../../utils/imageToImage";
import { EDIT_SECTION_TITLE } from "../../../utils/imageToImageText";
import { SD_CPP_NAME, SD_CPP_RUNTIME_ID } from "../../../utils/playground";
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
import EditForm from "./EditForm/EditForm";
import { InputImagePicker } from "./InputImagePicker/InputImagePicker";
import { useInputImagePicker } from "./InputImagePicker/useInputImagePicker";

/**
 * Image to image: the input picture, the form, the running edit and the result. The models that take a
 * picture are picked in the header's selector. The result shows only the edits, not the text to image ones.
 */
export default function ImageToImagePanel() {
  const runtime = useRuntimeCheck(SD_CPP_RUNTIME_ID);
  const { generate, cancel: cancelJob } = useImageGeneration();
  const setInputImage = usePlaygroundStore((s) => s.setInputImage);
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
  const result = resultOfKind(
    usePlaygroundStore((s) => s.result),
    "generate",
  );

  const editModels = models ? imageToImageModels(models) : null;
  const selected = editModels?.find((m) => m.id === selectedModelId) ?? null;
  const blockedReason = editBlockedReason({
    runtime: runtime.status,
    model: selected,
    inputPath: inputImage?.path ?? null,
    prompt: form.prompt,
    jobRunning: job !== null,
  });
  // The text to image tab shows its own results, so this tab shows only the edits.
  const editResult = result?.inputPath ? result : null;

  const startEdit = () => {
    if (!selected || !inputImage) return;
    const request = buildEditRequest(newImageJobId(), selected, form, inputImage.path, strength);
    generate(request, form, inputImage.path);
  };

  return (
    <Flex direction="column" gap="l">
      {runtime.status === "missing" && (
        <RuntimeNotice message={runtimeMissingMessage("Image editing", SD_CPP_NAME)} />
      )}
      {runtime.error && <ErrorBanner message={runtime.error} />}

      {editModels && selected === null && <PickModelHint />}

      {models && (
        <>
          <SurfaceCard title={EDIT_SECTION_TITLE}>
            <Flex direction="column" gap="m">
              <InputImagePicker
                input={inputImage}
                error={inputPicker.error}
                disabled={job !== null}
                onChoose={inputPicker.chooseFile}
                onSourceSize={setInputSourceSize}
              />
              <EditForm
                form={form}
                model={selected}
                strength={strength}
                onChange={setForm}
                onStrengthChange={setStrength}
                onGenerate={startEdit}
                blockedReason={blockedReason}
              />
            </Flex>
          </SurfaceCard>
          {job && <GenerationProgress job={job} onCancel={cancelJob} />}
          {editResult && (
            <GeneratedImage result={editResult} devices={devices} onUseSeed={applySeed} />
          )}
        </>
      )}
    </Flex>
  );
}
