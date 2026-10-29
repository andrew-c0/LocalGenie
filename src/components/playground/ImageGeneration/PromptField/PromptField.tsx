import type { FieldProps } from "@fluentui/react-components";
import { Field, Textarea } from "@fluentui/react-components";
import "./PromptField.css";

interface PromptFieldProps {
  /** The box's label: a string, or a label with its help. */
  label: FieldProps["label"];
  /** The line under the box: why it is locked, or what to type. */
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder?: string;
  disabled?: boolean;
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
}: PromptFieldProps) {
  return (
    <Field label={label} hint={hint}>
      <Textarea
        className="prompt-field__textarea"
        disabled={disabled}
        value={value}
        onChange={(_, data) => onChange(data.value)}
        resize="vertical"
        rows={rows}
        placeholder={placeholder}
      />
    </Field>
  );
}
