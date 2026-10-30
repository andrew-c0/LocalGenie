import { Badge, MenuItem, Spinner } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { precisionInfo } from "../../../../../services/hubApi";
import { shortName } from "../../../../../utils/format";
import type { CapabilityBadge } from "../../../../../utils/modelCapabilities";
import type { ModelRamLine } from "../../../../../utils/modelRam";
import { rowStatusText, type SelectorRow } from "../../../../../utils/modelSelector";
import { bitsBadgeColor } from "../../../../../utils/quantBadge";
import { Meta } from "../../../../ui/Typography/Typography";
import { ModelCapabilityIcons } from "./ModelCapabilityIcons/ModelCapabilityIcons";
import { ModelRamNote } from "./ModelRamNote/ModelRamNote";
import "./ModelOptionButton.css";

export interface ModelOptionButtonProps {
  row: SelectorRow;
  /** True while any model action is in progress. */
  disabled: boolean;
  /** This row's model is the one being loaded right now. */
  loadingHere: boolean;
  onSelect: (name: string) => void;
  /** Confirmed capability icons for this row. Empty when none are confirmed or not loaded yet. */
  badges?: CapabilityBadge[];
  /** RAM line under the name. Null when there is no estimate yet. */
  ram?: ModelRamLine | null;
}

/** The status beside a name: a badge for a loaded model, plain text for one not loaded yet. */
function statusNode(row: SelectorRow, text: string | null): ReactNode {
  if (text === null) return null;
  if (!row.loaded) return <Meta>{text}</Meta>;
  return (
    <Badge
      appearance={row.active ? "filled" : "tint"}
      color={row.active ? "brand" : "success"}
      size="small"
    >
      {text}
    </Badge>
  );
}

/**
 * One installed model in the model selector popover, drawn as a table row. The cells are name,
 * quant, size and capabilities; the column widths come from the list (ModelSelectorPopover.css).
 * The name cell carries the status beside the name (an Active or Loaded badge, or the compute a load
 * would use), the device the server reports under it, and the RAM line under that.
 * Clicking a row loads it, or switches to it when it is loaded. The active row is not clickable.
 * The unload button for a loaded row sits beside this row, not inside it (see ModelSelectorPopover).
 */
export function ModelOptionButton({
  row,
  disabled,
  loadingHere,
  onSelect,
  badges = [],
  ram = null,
}: ModelOptionButtonProps) {
  const { model } = row;
  const precision = model.precisions.length > 0 ? model.precisions[0] : null;
  const status = statusNode(row, rowStatusText(row));

  return (
    <MenuItem
      // The active model is already selected, so it is not clickable and shows no pointer.
      disabled={disabled || row.active}
      className={row.active ? "model-option model-option--active" : "model-option"}
      onClick={() => onSelect(model.name)}
    >
      {/* Every cell is always rendered so rows without a quant or capabilities still line up. */}
      <span className="model-table__row">
        <span className="model-table__cell model-table__cell--name">
          <span className="model-option__title">
            <span className="model-option__name">{shortName(model.name)}</span>
            {(loadingHere || status !== null) && (
              <span className="model-option__status">
                {loadingHere && <Spinner size="tiny" />}
                {status}
              </span>
            )}
          </span>
          {row.device !== null && <Meta className="model-option__device">{row.device}</Meta>}
          {ram && <ModelRamNote ram={ram} />}
        </span>
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
        </span>
      </span>
    </MenuItem>
  );
}
