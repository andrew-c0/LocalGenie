import type { ImageForm, ImageModel } from "../../../../types";
import {
  GENERATE_PROMPT_LABEL,
  GENERATE_PROMPT_PLACEHOLDER,
} from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { AdvancedSettings } from "../../ImageGeneration/AdvancedSettings/AdvancedSettings";
import { PromptField } from "../../ImageGeneration/PromptField/PromptField";

const PROMPT_ROWS = 3;

interface GenerateFormProps {
  form: ImageForm;
  /** The selected model. Its capabilities decide which advanced fields can be changed. */
  model: ImageModel | null;
  onChange: (patch: Partial<ImageForm>) => void;
}

/** The text to image inputs: the prompt, then the advanced settings in a closed accordion. */
export default function GenerateForm({ form, model, onChange }: GenerateFormProps) {
  return (
    <Flex direction="column" gap="m">
      <PromptField
        label={GENERATE_PROMPT_LABEL}
        value={form.prompt}
        onChange={(prompt) => onChange({ prompt })}
        rows={PROMPT_ROWS}
        placeholder={GENERATE_PROMPT_PLACEHOLDER}
      />
      <AdvancedSettings form={form} model={model} onChange={onChange} />
    </Flex>
  );
}
