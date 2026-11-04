import { Button, Popover, PopoverTrigger, Tooltip } from "@fluentui/react-components";
import { BeakerRegular, ChevronDownRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { selectorLabelOf } from "../../../../utils/playgroundSelector";
import { PlaygroundSelectorContent } from "./PlaygroundSelectorContent/PlaygroundSelectorContent";
import { usePlaygroundSelectorData } from "./usePlaygroundSelectorData";
import "./PlaygroundModelSelector.css";

/**
 * The header's model selector on the Playground pages: the page's tool and the model it uses. The
 * popover lists the tool's models, or every tool's on the landing. It replaces the chat selector there.
 */
export function PlaygroundModelSelector() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const selector = usePlaygroundSelectorData(pathname);

  return (
    <>
      <Tooltip content="Only available for the Playground page" relationship="label">
        <span className="playground-selector__icon">
          <BeakerRegular />
        </span>
      </Tooltip>
      <Popover
        open={open}
        onOpenChange={(_, change) => setOpen(change.open)}
        positioning={{ position: "below", align: "start", matchTargetSize: "width" }}
      >
        <PopoverTrigger disableButtonEnhancement>
          <Button
            appearance="secondary"
            icon={<ChevronDownRegular />}
            iconPosition="after"
            aria-label="Switch Playground model"
            title="Switch Playground model"
            className="flex-grow header__model"
          >
            {selectorLabelOf(selector.currentTool)}
          </Button>
        </PopoverTrigger>
        <PlaygroundSelectorContent data={selector} onPicked={() => setOpen(false)} />
      </Popover>
    </>
  );
}
