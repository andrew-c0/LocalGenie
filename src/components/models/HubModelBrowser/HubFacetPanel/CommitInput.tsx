import { Input } from "@fluentui/react-components";
import { useEffect, useState } from "react";

interface Props {
  /** The stored value. The field shows it until the user edits it. */
  value: string;
  /** Called on blur or Enter with the typed text, so a half-typed value does not refetch the list. */
  onCommit: (text: string) => void;
  placeholder?: string;
  label: string;
  inputMode?: "text" | "decimal";
}

/** A text input that commits on blur or Enter. */
export function CommitInput({ value, onCommit, placeholder, label, inputMode = "text" }: Props) {
  const [draft, setDraft] = useState(value);

  // The stored value changed from outside (for example Clear): show it.
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <Input
      aria-label={label}
      placeholder={placeholder}
      inputMode={inputMode}
      value={draft}
      onChange={(_, data) => setDraft(data.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
    />
  );
}
