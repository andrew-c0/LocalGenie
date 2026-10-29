import { Field, SpinButton, Switch } from "@fluentui/react-components";
import type { ImageForm, ImageModel } from "../../../../types";
import { imageFormControls } from "../../../../utils/playground";
import {
  CFG_SCALE_HELP,
  NEGATIVE_PROMPT_HELP,
  NEGATIVE_PROMPT_HINT,
  SEED_HELP,
  STEPS_HELP,
} from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { HelpLabel } from "../../../ui/HelpLabel/HelpLabel";
import { PromptField } from "../PromptField/PromptField";
import type { ComputeControls } from "../useComputeDevices";
import { ComputeField } from "./ComputeField";
import { ImageSizeSection } from "./ImageSizeSection";

const MAX_STEPS = 150;
const CFG_MIN = 1;
const CFG_MAX = 20;
const CFG_STEP = 0.5;

interface ImageSettingsFieldsProps {
  form: ImageForm;
  /** The selected model. Its capabilities decide which fields can be changed. */
  model: ImageModel | null;
  onChange: (patch: Partial<ImageForm>) => void;
  compute: ComputeControls;
  /** Width and height must be multiples of this. Left out for text to image's 8. */
  sizeStep?: number;
  /** Replaces the size hint, e.g. when the size follows the input picture. */
  sizeHint?: string;
}

/**
 * The settings both image tabs share, below their prompts: the negative prompt, size, steps and CFG
 * scale, seed and compute. Editing is allowed while an image runs; Generate waits for it.
 */
export function ImageSettingsFields({
  form,
  model,
  onChange,
  compute,
  sizeStep,
  sizeHint,
}: ImageSettingsFieldsProps) {
  const controls = imageFormControls(model);

  return (
    <Flex direction="column" gap="m">
      <PromptField
        label={<HelpLabel label="Negative prompt" help={NEGATIVE_PROMPT_HELP} />}
        hint={controls.negativePromptReason ?? NEGATIVE_PROMPT_HINT}
        disabled={controls.negativePromptReason !== null}
        value={form.negativePrompt}
        onChange={(negativePrompt) => onChange({ negativePrompt })}
        rows={2}
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
        <Field label={<HelpLabel label="Steps" help={STEPS_HELP} />}>
          <SpinButton
            min={1}
            max={MAX_STEPS}
            step={1}
            value={form.steps}
            onChange={(_, data) => onChange({ steps: data.value ?? form.steps })}
          />
        </Field>
        <Field
          label={<HelpLabel label="CFG scale" help={CFG_SCALE_HELP} />}
          hint={controls.cfgReason ?? undefined}
        >
          <SpinButton
            disabled={controls.cfgReason !== null}
            min={CFG_MIN}
            max={CFG_MAX}
            step={CFG_STEP}
            precision={1}
            value={form.cfgScale}
            onChange={(_, data) => onChange({ cfgScale: data.value ?? form.cfgScale })}
          />
        </Field>
      </Flex>

      <Flex gap="m" wrap align="end">
        <Switch
          label="Random seed"
          checked={form.randomSeed}
          onChange={(_, data) => onChange({ randomSeed: data.checked })}
        />
        <Field label={<HelpLabel label="Seed" help={SEED_HELP} />}>
          <SpinButton
            disabled={form.randomSeed}
            step={1}
            value={form.seed}
            onChange={(_, data) => onChange({ seed: data.value ?? form.seed })}
          />
        </Field>
      </Flex>

      <ComputeField
        selected={form.device}
        onSelect={(device) => onChange({ device })}
        controls={compute}
      />
    </Flex>
  );
}
