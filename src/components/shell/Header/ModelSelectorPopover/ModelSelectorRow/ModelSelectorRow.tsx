import { Button } from "@fluentui/react-components";
import { PlugDisconnectedRegular } from "@fluentui/react-icons";
import type { ComputeTarget } from "../../../../../types";
import type { ModelRamLine } from "../../../../../utils/modelRam";
import type { SelectorRow } from "../../../../../utils/modelSelector";
import { COMPUTE_PORT_LABELS } from "../../../../../utils/serverPorts";
import { CapabilityModelOption } from "../CapabilityModelOption/CapabilityModelOption";
import "./ModelSelectorRow.css";

interface ModelSelectorRowProps {
  row: SelectorRow;
  ram: ModelRamLine | null;
  /** Model name, or a LOADING_* key, while an action is in progress. */
  loading: string | null;
  onChoose: (name: string) => void;
  onUnload: (compute: ComputeTarget) => void;
}

/**
 * One installed model in the selector. A loaded model gets its unload button beside the row, outside
 * the menu item, so no interactive element sits inside a menuitem.
 */
export function ModelSelectorRow({ row, ram, loading, onChoose, onUnload }: ModelSelectorRowProps) {
  const target = row.compute;
  return (
    <div className="model-option-row">
      <CapabilityModelOption
        row={row}
        disabled={loading !== null}
        loadingHere={loading === row.model.name}
        onSelect={onChoose}
        ram={ram}
      />
      {row.loaded && target !== null && (
        <Button
          appearance="secondary"
          size="small"
          icon={<PlugDisconnectedRegular />}
          aria-label={`Unload ${COMPUTE_PORT_LABELS[target]} model`}
          title={`Unload ${COMPUTE_PORT_LABELS[target]} model`}
          disabled={loading !== null}
          onClick={() => onUnload(target)}
        />
      )}
    </div>
  );
}
