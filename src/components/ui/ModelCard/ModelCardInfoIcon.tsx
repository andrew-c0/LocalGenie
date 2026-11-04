import { Tooltip } from "@fluentui/react-components";
import type { ReactElement } from "react";

interface ModelCardInfoIconProps {
  /** A 16px Fluent icon. */
  icon: ReactElement;
  /** Accessible name of the icon. */
  label: string;
  /** Tooltip text, one line each. */
  lines: string[];
}

/** A small neutral icon on a card's first row. Its tooltip holds the text, so the card stays compact. */
export function ModelCardInfoIcon({ icon, label, lines }: ModelCardInfoIconProps) {
  return (
    <Tooltip relationship="description" content={lines.map((line) => <div key={line}>{line}</div>)}>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip opens on focus, so a keyboard user can read it */}
      <span className="model-card__info-icon" role="img" aria-label={label} tabIndex={0}>
        {icon}
      </span>
    </Tooltip>
  );
}
