import { Badge, MenuItem } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { precisionInfo } from "../../../../../services/hubApi";
import type { ModelInfo } from "../../../../../types";
import { shortName } from "../../../../../utils/format";
import type { CapabilityBadge } from "../../../../../utils/modelCapabilities";
import { bitsBadgeColor } from "../../../../../utils/quantBadge";
import { ModelCapabilityIcons } from "./ModelCapabilityIcons/ModelCapabilityIcons";
import "./ModelOptionButton.css";

export interface ModelOptionButtonProps {
  model: ModelInfo;
  isActive: boolean;
  loadedHere: boolean;
  /** True while any model action is in progress. */
  disabled: boolean;
  onSelect: (name: string) => void;
  /** Confirmed capability icons for this row. Empty when none are confirmed or not loaded yet. */
  badges?: CapabilityBadge[];
}

/**
 * One selectable installed model in the model selector popover, drawn as a table row. The cells are
 * name, quant, size and capabilities; the column widths come from the list (ModelSelectorPopover.css).
 * The capabilities cell holds the capability icons, then the status: an Active badge for an active
 * model that is not loaded on the server. Loading progress is shown by the footer button, not the row.
 * Loaded rows carry no text status. Clicking any row that is not active loads it, or switches to it
 * when it is loaded.
 */
export function ModelOptionButton({
  model,
  isActive,
  loadedHere,
  disabled,
  onSelect,
  badges = [],
}: ModelOptionButtonProps) {
  const precision = model.precisions.length > 0 ? model.precisions[0] : null;

  let trailingStatus: ReactNode;
  // Loaded rows show no text status: the Loaded & Active group heading says so. The Active badge is only
  // for an active model that is not loaded on the server (for example after the server stopped).
  if (isActive && !loadedHere) {
    trailingStatus = (
      <Badge appearance="tint" color="brand" size="small">
        Active
      </Badge>
    );
  }

  return (
    <MenuItem
      // The active model is already selected, so it is not clickable and shows no pointer.
      disabled={disabled || isActive}
      className={isActive ? "model-option model-option--active" : "model-option"}
      onClick={() => onSelect(model.name)}
    >
      {/* Every cell is always rendered so rows without a quant or capabilities still line up. */}
      <span className="model-table__row">
        <span className="model-table__cell model-table__cell--name">{shortName(model.name)}</span>
        <span className="model-table__cell model-table__cell--quant">
          {precision && (
            <Badge
              appearance="outline"
              color={bitsBadgeColor(precisionInfo(precision).bitsPerWeight ?? 4)}
            >
              {precision}
            </Badge>
          )}
        </span>
        <span className="model-table__cell model-table__cell--size">{model.size}</span>
        <span className="model-table__cell model-table__cell--caps">
          <ModelCapabilityIcons badges={badges} />
          <span className="model-option__status">{trailingStatus}</span>
        </span>
      </span>
    </MenuItem>
  );
}
