import type { ImageForm, ImageModel } from "../../../../types";
import { Flex } from "../../../ui/Flex/Flex";
import { ImageSizeSection } from "./ImageSizeSection";
import { NegativePromptField } from "./NegativePromptField";
import { SeedFields } from "./SeedFields";
import { StepsCfgFields } from "./StepsCfgFields";

interface ImageSettingsFieldsProps {
  form: ImageForm;
  /** The selected model. Its capabilities decide which fields can be changed. */
  model: ImageModel | null;
  onChange: (patch: Partial<ImageForm>) => void;
  /** Width and height must be multiples of this. Left out for text to image's 8. */
  sizeStep?: number;
  /** Replaces the size hint, e.g. when the size follows the input picture. */
  sizeHint?: string;
}

/**
 * The settings both image tabs share, below their prompts: the negative prompt, size, steps and CFG
 * scale and seed. Editing is allowed while an image runs; Generate waits for it. The compute choice is
 * in the Playground selector.
 */
export function ImageSettingsFields({
  form,
  model,
  onChange,
  sizeStep,
  sizeHint,
}: ImageSettingsFieldsProps) {
  return (
    <Flex direction="column" gap="m">
      <NegativePromptField
        value={form.negativePrompt}
        model={model}
        onChange={(negativePrompt) => onChange({ negativePrompt })}
      />

      <ImageSizeSection
        width={form.width}
        height={form.height}
        nativeSize={model?.defaults ?? null}
        onChange={onChange}
        step={sizeStep}
        hint={sizeHint}
      />

      <Flex gap="m" wrap align="end">
        <StepsCfgFields form={form} model={model} onChange={onChange} />
      </Flex>

      <Flex gap="m" wrap align="end">
        <SeedFields form={form} onChange={onChange} />
      </Flex>
    </Flex>
  );
}
