import { Button, Field, SpinButton, Switch, Textarea } from "@fluentui/react-components";
import type { ImageForm, ImageModel } from "../../../../types";
import { imageFormControls } from "../../../../utils/playground";
import {
  CFG_SCALE_HELP,
  MODEL_LOAD_NOTE,
  NEGATIVE_PROMPT_HELP,
  NEGATIVE_PROMPT_HINT,
  SEED_HELP,
  STEPS_HELP,
} from "../../../../utils/playgroundText";
import { Flex } from "../../../ui/Flex/Flex";
import { HelpLabel } from "../../../ui/HelpLabel/HelpLabel";
import { Meta } from "../../../ui/Typography/Typography";
import type { ComputeControls } from "../useComputeDevices";
import { ComputeField } from "./ComputeField";
import { ImageSizeSection } from "./ImageSizeSection";
import "./GenerateForm.css";

const MAX_STEPS = 150;
const CFG_MIN = 1;
const CFG_MAX = 20;
const CFG_STEP = 0.5;

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

/** The text-to-image inputs and the Generate button. Editing is allowed while an image runs; Generate waits for it. */
export default function GenerateForm({
  form,
  model,
  onChange,
  onGenerate,
  blockedReason,
  compute,
}: GenerateFormProps) {
  const controls = imageFormControls(model);

  return (
    <Flex direction="column" gap="m">
      <Field label="Prompt">
        <Textarea
          className="generate-form__textarea"
          value={form.prompt}
          onChange={(_, data) => onChange({ prompt: data.value })}
          resize="vertical"
          rows={3}
          placeholder="Describe the image"
        />
      </Field>

      <Field
        label={<HelpLabel label="Negative prompt" help={NEGATIVE_PROMPT_HELP} />}
        hint={controls.negativePromptReason ?? NEGATIVE_PROMPT_HINT}
      >
        <Textarea
          className="generate-form__textarea"
          disabled={controls.negativePromptReason !== null}
          value={form.negativePrompt}
          onChange={(_, data) => onChange({ negativePrompt: data.value })}
          resize="vertical"
          rows={2}
        />
      </Field>

      <ImageSizeSection
        width={form.width}
        height={form.height}
        nativeSize={model?.defaults ?? null}
        onChange={onChange}
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

      <Flex direction="column" gap="xs">
        <Flex gap="m" align="center" wrap>
          <Button appearance="primary" onClick={onGenerate} disabled={blockedReason !== null}>
            Generate
          </Button>
          {blockedReason && <Meta>{blockedReason}</Meta>}
        </Flex>
        <Meta>{MODEL_LOAD_NOTE}</Meta>
      </Flex>
    </Flex>
  );
}
