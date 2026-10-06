import type { ReactNode } from "react";
import "./ChipRow.css";

/** A row of selectable chips (tabs/filters). Controlled by the parent. */
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
  /** Extra chips appended after the options (e.g. "clear" actions). */
  children?: ReactNode;
}) {
  return (
    <div className="lx-chiprow" role="tablist" aria-label={ariaLabel}>
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          className={`lx-chip${value === id ? " active" : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
      {children}
    </div>
  );
}
