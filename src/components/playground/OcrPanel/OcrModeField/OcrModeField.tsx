import { Field, Radio, RadioGroup } from "@fluentui/react-components";
import type { OcrMode, OcrModeOption } from "../../../../types";
import { OCR_MODE_LABEL } from "../../../../utils/ocrText";

interface OcrModeFieldProps {
  /** The modes of the selected model. The choice shows only when there is more than one. */
  modes: OcrModeOption[];
  mode: OcrMode;
  disabled: boolean;
  onModeChange: (mode: OcrMode) => void;
}

/** How to read the picture ("Read as"), when the model has more than one way. Where it runs is in the selector. */
export function OcrModeField({ modes, mode, disabled, onModeChange }: OcrModeFieldProps) {
  if (modes.length <= 1) return null;

  return (
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
  );
}
