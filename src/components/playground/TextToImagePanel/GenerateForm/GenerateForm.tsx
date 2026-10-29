import type { ImageForm, ImageModel } from "../../../../types";
import { MODEL_LOAD_NOTE } from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { GenerateFooter } from "../../ImageGeneration/GenerateFooter/GenerateFooter";
import { ImageSettingsFields } from "../../ImageGeneration/ImageSettingsFields/ImageSettingsFields";
import { PromptField } from "../../ImageGeneration/PromptField/PromptField";
import type { ComputeControls } from "../../ImageGeneration/useComputeDevices";

interface GenerateFormProps {
  form: ImageForm;
  /** The selected model. Its capabilities decide which fields can be changed. */
  model: ImageModel | null;
  onChange: (patch: Partial<ImageForm>) => void;
  onGenerate: () => void;
  /** Why Generate is off. Null when it can run. */
  blockedReason: string | null;
  compute: ComputeControls;
}

/** The text-to-image inputs and the Generate button. */
export default function GenerateForm({
  form,
  model,
  onChange,
  onGenerate,
  blockedReason,
  compute,
}: GenerateFormProps) {
  return (
    <Flex direction="column" gap="m">
      <PromptField
        label="Prompt"
        value={form.prompt}
        onChange={(prompt) => onChange({ prompt })}
        rows={3}
        placeholder="Describe the image"
      />
      <ImageSettingsFields form={form} model={model} onChange={onChange} compute={compute} />
      <GenerateFooter
        onGenerate={onGenerate}
        blockedReason={blockedReason}
        note={MODEL_LOAD_NOTE}
      />
    </Flex>
  );
}
