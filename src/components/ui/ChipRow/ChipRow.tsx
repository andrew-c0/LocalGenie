import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import { Tab, TabList } from "@fluentui/react-components";
import type { ReactNode } from "react";
import "./ChipRow.css";

/** A row of selectable filters (Fluent TabList), controlled by the parent. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  children,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  /** Extra controls appended after the options (e.g. "clear" actions). */
  children?: ReactNode;
}) {
  const handleSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    const match = options.find(([id]) => id === data.value);
    if (match) onChange(match[0]);
  };

  return (
    <div className="chip-row__row">
      <TabList
        size="small"
        appearance="subtle"
        aria-label={ariaLabel}
        selectedValue={value}
        onTabSelect={handleSelect}
      >
        {options.map(([id, label]) => (
          <Tab key={id} value={id}>
            {label}
          </Tab>
        ))}
      </TabList>
      {children}
    </div>
  );
}
