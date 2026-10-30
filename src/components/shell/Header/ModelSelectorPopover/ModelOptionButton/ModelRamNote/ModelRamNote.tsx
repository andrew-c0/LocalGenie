import { Tooltip } from "@fluentui/react-components";
import { WarningRegular } from "@fluentui/react-icons";
import type { ModelRamLine } from "../../../../../../utils/modelRam";
import { Meta } from "../../../../../ui/Typography/Typography";
import "./ModelRamNote.css";

/**
 * The RAM estimate under a model's name. A model that does not fit the free RAM reads "Won't load" in
 * the warning colour, with a warning icon; the tooltip gives the same reason the loader refuses it with.
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
