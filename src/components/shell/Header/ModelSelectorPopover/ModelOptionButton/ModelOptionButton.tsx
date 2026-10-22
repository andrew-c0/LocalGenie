import { Badge, MenuItem, Spinner } from "@fluentui/react-components";
import type { ModelInfo } from "../../../../../types";
import { shortName } from "../../../../../utils/format";
import "./ModelOptionButton.css";

interface ModelOptionButtonProps {
  model: ModelInfo;
  isActive: boolean;
  loadedHere: boolean;
  /** True while this model is being loaded. */
  loading: boolean;
  /** True while any other action is in progress. */
  disabled: boolean;
  onSelect: (name: string) => void;
}

/** One selectable installed model in the model selector popover. */
export function ModelOptionButton({
  model,
  isActive,
  loadedHere,
  loading,
  disabled,
  onSelect,
}: ModelOptionButtonProps) {
  const precision = model.precisions.length > 0 ? model.precisions[0] : null;

  return (
    <MenuItem
      // The active model is already selected, so it is not clickable and shows no pointer.
      disabled={disabled || isActive}
      className={isActive ? "model-option model-option--active" : "model-option"}
      icon={loading ? <Spinner size="tiny" /> : undefined}
      secondaryContent={
        isActive ? (
          <Badge appearance="tint" color="brand" size="small">
            Active
          </Badge>
        ) : (
          <Badge appearance="outline" color="informative" size="small">
            {loadedHere ? "Loaded" : "Load"}
          </Badge>
        )
      }
      onClick={() => onSelect(model.name)}
    >
      {shortName(model.name)}
      {precision && ` · ${precision}`} · {model.size}
    </MenuItem>
  );
}
