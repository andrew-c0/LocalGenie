import { Tooltip } from "@fluentui/react-components";
import { WarningRegular } from "@fluentui/react-icons";
import type { ModelRamLine } from "../../../../../../utils/modelRam";
import { Meta } from "../../../../../ui/Typography/Typography";
import "./ModelRamNote.css";

/**
 * The RAM estimate under a model's name. A model that does not fit the free RAM gets a warning colour
 * and a warning icon, and the reason shows in a tooltip. It is a warning only; loading is not blocked.
 */
export function ModelRamNote({ ram }: { ram: ModelRamLine }) {
  if (!ram.warning) {
    return <Meta className="model-ram-note">{ram.label}</Meta>;
  }
  return (
    <Tooltip content={ram.warning} relationship="description">
      <Meta className="model-ram-note model-ram-note--warning">
        <WarningRegular aria-hidden />
        {ram.label}
      </Meta>
    </Tooltip>
  );
}
