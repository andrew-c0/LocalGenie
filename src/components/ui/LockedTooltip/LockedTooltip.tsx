import { Tooltip } from "@fluentui/react-components";
import type { ReactNode } from "react";
import "./LockedTooltip.css";

interface LockedTooltipProps {
  /** Why the control is locked. Null when it can be edited: the children are rendered as they are. */
  reason: string | null;
  children: ReactNode;
}

/**
 * Explains a locked control in a tooltip. A disabled control does not react to the pointer, so while it is locked the
 * control sits in a span that does, and the tooltip hangs on the span.
 */
export function LockedTooltip({ reason, children }: LockedTooltipProps) {
  if (reason === null) return <>{children}</>;
  return (
    <Tooltip content={reason} relationship="description" withArrow>
      <span className="locked-tooltip">{children}</span>
    </Tooltip>
  );
}
