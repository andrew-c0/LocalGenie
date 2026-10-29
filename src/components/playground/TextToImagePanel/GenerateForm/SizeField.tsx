import { Field, Input } from "@fluentui/react-components";
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { imageSizeError, snapImageSize } from "../../../../utils/playground";

interface SizeFieldProps {
  /** "Width" or "Height". Names the field in the error text. */
  fieldName: string;
  /** The committed size, always a valid one. */
  value: number;
  onCommit: (value: number) => void;
}

/**
 * A width or height typed as text. The text is checked as the user types; leaving the field, or
 * pressing Enter, snaps it to the nearest valid size. Blank or non-number text returns to `value`.
 */
export function SizeField({ fieldName, value, onCommit }: SizeFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  const error = imageSizeError(fieldName, text);

  const commitText = () => {
    const next = snapImageSize(text, value);
    if (next !== value) onCommit(next);
    setDraft(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commitText();
  };

  return (
    <Field
      label={fieldName}
      validationState={error ? "error" : "none"}
      validationMessage={error ?? undefined}
    >
      <Input
        inputMode="numeric"
        value={text}
        onChange={(_, data) => setDraft(data.value)}
        onBlur={commitText}
        onKeyDown={handleKeyDown}
      />
    </Field>
  );
}
