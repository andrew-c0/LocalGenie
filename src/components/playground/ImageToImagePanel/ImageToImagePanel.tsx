import type { ReactNode } from "react";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { ImageModel } from "../../../types";
import { StatusBadge } from "../../ui/StatusBadge/StatusBadge";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { SurfaceCard } from "../../ui/SurfaceCard/SurfaceCard";
import {
  buildEditRequest,
  editBlockedReason,
  imageToImageModels,
  inputBadgeLabel,
} from "../../../utils/imageToImage";
import { EDIT_SECTION_TITLE } from "../../../utils/imageToImageText";
import { SD_CPP_NAME, SD_CPP_RUNTIME_ID } from "../../../utils/playground";
import { runtimeMissingMessage } from "../../../utils/playgroundText";
import GeneratedImage from "../ImageGeneration/GeneratedImage/GeneratedImage";
import GenerationProgress from "../ImageGeneration/GenerationProgress/GenerationProgress";
import { useComputeDevices } from "../ImageGeneration/useComputeDevices";
import { newImageJobId, useImageGeneration } from "../ImageGeneration/useImageGeneration";
import { ImageModelColumn } from "../ImageModels/ImageModelColumn/ImageModelColumn";
import { useImageModels } from "../ImageModels/useImageModels";
import { RuntimeNotice } from "../RuntimeNotice/RuntimeNotice";
import { useRuntimeCheck } from "../useRuntimeCheck";
import EditForm from "./EditForm/EditForm";
import { InputImagePicker } from "./InputImagePicker/InputImagePicker";
import { useInputImagePicker } from "./InputImagePicker/useInputImagePicker";

/** The badge on a model card that takes a picture: "Re-draw" or "Edit with instructions". */
function inputBadge(model: ImageModel): ReactNode {
  const label = inputBadgeLabel(model.imageInput);
  return label ? <StatusBadge tone="blue">{label}</StatusBadge> : null;
}

/**
 * Image to image: the models that take a picture on the left; the input picture, the form, the
 * running edit and the result beside its input on the right.
 */
export default function ImageToImagePanel() {
  const { models, loadError } = useImageModels();
  const runtime = useRuntimeCheck(SD_CPP_RUNTIME_ID);
  const { generate, cancel: cancelJob } = useImageGeneration();
  const compute = useComputeDevices(runtime.status);
  const inputPicker = useInputImagePicker();

  const selectedModelId = usePlaygroundStore((s) => s.selectedModelId);
  const selectEditModel = usePlaygroundStore((s) => s.selectEditModel);
  const form = usePlaygroundStore((s) => s.form);
  const setForm = usePlaygroundStore((s) => s.setForm);
  const applySeed = usePlaygroundStore((s) => s.applySeed);
  const inputImage = usePlaygroundStore((s) => s.inputImage);
  const setInputSourceSize = usePlaygroundStore((s) => s.setInputSourceSize);
  const strength = usePlaygroundStore((s) => s.strength);
  const setStrength = usePlaygroundStore((s) => s.setStrength);
  const job = usePlaygroundStore((s) => s.job);
  const result = usePlaygroundStore((s) => s.result);

  const editModels = models ? imageToImageModels(models) : [];
  const selected = editModels.find((m) => m.id === selectedModelId) ?? null;
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
      {loadError && <ErrorBanner message={loadError} />}
      {!models && !loadError && <StateBlock message="Reading image models…" />}

      {models && (
        <Flex gap="l" align="start">
          <ImageModelColumn
            models={editModels}
            catalog={models}
            selectedModelId={selectedModelId}
            onSelect={selectEditModel}
            tagFor={inputBadge}
          />

          <Flex direction="column" gap="l" className="flex-grow">
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
                  compute={compute}
                />
              </Flex>
            </SurfaceCard>
            {job && <GenerationProgress job={job} onCancel={cancelJob} />}
            {editResult && (
              <GeneratedImage result={editResult} devices={compute.devices} onUseSeed={applySeed} />
            )}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
