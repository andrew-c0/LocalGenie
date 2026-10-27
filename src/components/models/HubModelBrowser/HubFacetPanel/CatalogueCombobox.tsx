import { Combobox, Option } from "@fluentui/react-components";
import { useState } from "react";

export interface CatalogueOption {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: CatalogueOption[];
  /** The selected option's value, or null for any. */
  value: string | null;
  onSelect: (value: string | null) => void;
}

/** A single-select list of Hub values that can be searched by typing. */
export function CatalogueCombobox({ label, options, value, onSelect }: Props) {
  // The typed text while the user is searching; null shows the selected value.
  const [query, setQuery] = useState<string | null>(null);

  const needle = (query ?? "").trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value ?? "";

  return (
    <Combobox
      aria-label={label}
      placeholder={`Any ${label.toLowerCase()}`}
      clearable
      value={query ?? selectedLabel}
      selectedOptions={value ? [value] : []}
      onChange={(e) => setQuery(e.target.value)}
      onOptionSelect={(_, data) => {
        onSelect(data.optionValue ?? null);
        setQuery(null);
      }}
      onBlur={() => setQuery(null)}
    >
      {shown.map((o) => (
        <Option key={o.value} value={o.value} text={o.label}>
          {o.label}
        </Option>
      ))}
    </Combobox>
  );
}
