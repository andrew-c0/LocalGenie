import { Field, Radio, RadioGroup } from "@fluentui/react-components";
import type {
  OcrCompute,
  OcrComputeSettings,
  OcrMode,
  OcrModeOption,
  OcrVisionCompute,
} from "../../../../types";
import {
  OCR_COMPUTE_HELP,
  OCR_COMPUTE_LABELS,
  OCR_COMPUTE_TITLE,
  OCR_LANGUAGE_MODEL_LABEL,
  OCR_MODE_LABEL,
  OCR_VISION_LABEL,
  OCR_VISION_LABELS,
} from "../../../../utils/ocrText";
import { Flex } from "../../../ui/Flex/Flex";
import { OptionDropdown } from "../../../ui/OptionDropdown/OptionDropdown";
import { BodyStrong, Meta } from "../../../ui/Typography/Typography";

interface OcrOptionsProps {
  /** The modes of the selected model. The choice shows only when there is more than one. */
  modes: OcrModeOption[];
  mode: OcrMode;
  settings: OcrComputeSettings;
  disabled: boolean;
  onModeChange: (mode: OcrMode) => void;
  onComputeChange: (compute: OcrCompute) => void;
  onVisionComputeChange: (visionCompute: OcrVisionCompute) => void;
}

const COMPUTE_OPTIONS = (Object.keys(OCR_COMPUTE_LABELS) as OcrCompute[]).map((value) => ({
  value,
  label: OCR_COMPUTE_LABELS[value],
}));

const VISION_OPTIONS = (Object.keys(OCR_VISION_LABELS) as OcrVisionCompute[]).map((value) => ({
  value,
  label: OCR_VISION_LABELS[value],
}));

/** The OCR choices: how to read the picture (when the model has more than one way) and where it runs. */
export function OcrOptions({
  modes,
  mode,
  settings,
  disabled,
  onModeChange,
  onComputeChange,
  onVisionComputeChange,
}: OcrOptionsProps) {
  return (
    <Flex direction="column" gap="m">
      {modes.length > 1 && (
        <Field label={OCR_MODE_LABEL}>
          <RadioGroup
            layout="horizontal"
            value={mode}
            disabled={disabled}
            onChange={(_, data) => {
              const chosen = modes.find((m) => m.id === data.value);
              if (chosen) onModeChange(chosen.id);
            }}
          >
            {modes.map((m) => (
              <Radio key={m.id} value={m.id} label={m.label} />
            ))}
          </RadioGroup>
        </Field>
      )}
      <BodyStrong>{OCR_COMPUTE_TITLE}</BodyStrong>
      <OptionDropdown
        label={OCR_LANGUAGE_MODEL_LABEL}
        options={COMPUTE_OPTIONS}
        value={settings.compute}
        onChange={onComputeChange}
        disabled={disabled}
        fullWidth
      />
      <OptionDropdown
        label={OCR_VISION_LABEL}
        options={VISION_OPTIONS}
        value={settings.visionCompute}
        onChange={onVisionComputeChange}
        disabled={disabled}
        fullWidth
      />
      <Meta>{OCR_COMPUTE_HELP}</Meta>
    </Flex>
  );
}
