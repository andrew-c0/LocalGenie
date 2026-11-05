import { Tooltip } from "@fluentui/react-components";
import { InfoRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import "./InfoTooltip.css";

interface InfoTooltipProps {
  /** The button's accessible name, e.g. "About the picture". */
  label: string;
  /** The explanation shown on hover and focus, and announced as the description. */
  help: string;
  /** The icon. Defaults to the info icon. */
  icon?: ReactNode;
}

/** A small info icon that shows its explanation on hover or focus. The trigger is a native button, so Tab reaches it. */
export function InfoTooltip({ label, help, icon }: InfoTooltipProps) {
  return (
    <Tooltip content={help} relationship="description" withArrow>
      <button type="button" className="info-tooltip__button" aria-label={label}>
        {icon ?? <InfoRegular aria-hidden />}
      </button>
    </Tooltip>
  );
}
