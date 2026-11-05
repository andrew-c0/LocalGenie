import type { FieldProps } from "@fluentui/react-components";
import { Field, Textarea } from "@fluentui/react-components";
import { LockedTooltip } from "../../../ui/LockedTooltip/LockedTooltip";
import "./PromptField.css";

interface PromptFieldProps {
  /** The box's label: a string, or a label with its help. */
  label: FieldProps["label"];
  /** The line under the box: what to type. Left out while the box is locked. */
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
  disabled?: boolean;
  /** Why the box is locked. Shown as a tooltip while it is disabled. */
  lockedReason?: string | null;
}

/** A full-width multi-line text box in a Field. Both image prompts and the negative prompt use it. */
export function PromptField({
  label,
  hint,
  value,
  onChange,
  rows,
  placeholder,
  disabled = false,
  lockedReason = null,
}: PromptFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <LockedTooltip reason={disabled ? lockedReason : null}>
        <Textarea
          className="prompt-field__textarea"
          disabled={disabled}
          value={value}
          onChange={(_, data) => onChange(data.value)}
          resize="vertical"
          rows={rows}
          placeholder={placeholder}
        />
      </LockedTooltip>
    </Field>
  );
}
