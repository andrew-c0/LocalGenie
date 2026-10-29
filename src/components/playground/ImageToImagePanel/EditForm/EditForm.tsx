import type { ImageForm, ImageModel } from "../../../../types";
import { EDIT_SIZE_STEP, editPromptLabel } from "../../../../utils/imageToImage";
import {
  EDIT_SIZE_HINT,
  EDIT_TIME_NOTE,
  PROMPT_PLACEHOLDER_INIT,
  PROMPT_PLACEHOLDER_REFERENCE,
} from "../../../../utils/imageToImageText";
import { Flex } from "../../../ui/Flex/Flex";
import { GenerateFooter } from "../../ImageGeneration/GenerateFooter/GenerateFooter";
import { ImageSettingsFields } from "../../ImageGeneration/ImageSettingsFields/ImageSettingsFields";
import { PromptField } from "../../ImageGeneration/PromptField/PromptField";
import type { ComputeControls } from "../../ImageGeneration/useComputeDevices";
import { StrengthField } from "./StrengthField";

interface EditFormProps {
  form: ImageForm;
  /** The selected model. Its kind decides the prompt wording and whether the strength shows. */
  model: ImageModel | null;
  strength: number;
  onChange: (patch: Partial<ImageForm>) => void;
  onStrengthChange: (strength: number) => void;
  onGenerate: () => void;
  /** Why Generate is off. Null when it can run. */
  blockedReason: string | null;
  compute: ComputeControls;
}

/** The image to image inputs below the picture: the prompt, the strength for a re-draw model, the shared settings and Generate. */
export default function EditForm({
  form,
  model,
  strength,
  onChange,
  onStrengthChange,
  onGenerate,
  blockedReason,
  compute,
}: EditFormProps) {
  const kind = model?.imageInput ?? null;

  return (
    <Flex direction="column" gap="m">
      <PromptField
        label={editPromptLabel(kind)}
        value={form.prompt}
        onChange={(prompt) => onChange({ prompt })}
        rows={3}
        placeholder={kind === "reference" ? PROMPT_PLACEHOLDER_REFERENCE : PROMPT_PLACEHOLDER_INIT}
      />
      {kind === "init" && <StrengthField value={strength} onChange={onStrengthChange} />}
      <ImageSettingsFields
        form={form}
        model={model}
        onChange={onChange}
        compute={compute}
        sizeStep={EDIT_SIZE_STEP}
        sizeHint={EDIT_SIZE_HINT}
      />
      <GenerateFooter onGenerate={onGenerate} blockedReason={blockedReason} note={EDIT_TIME_NOTE} />
    </Flex>
  );
}
