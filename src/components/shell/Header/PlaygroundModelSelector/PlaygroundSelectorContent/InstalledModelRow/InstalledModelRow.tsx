import { Button } from "@fluentui/react-components";
import type { SelectorRow } from "../../../../../../utils/playgroundSelector";
import { toggleToolModel } from "../../../../../playground/playgroundSelection";
import { Flex } from "../../../../../ui/Flex/Flex";
import { BodyStrong, Meta } from "../../../../../ui/Typography/Typography";
import "./InstalledModelRow.css";

interface InstalledModelRowProps {
  row: SelectorRow;
  /** Closes the popover after the model is picked or cleared. */
  onPicked: () => void;
}

/**
 * A downloaded model as a card. Its button picks the model for the tool, or clears it when the tool
 * already uses it (the button then reads Selected and can be clicked again).
 */
export function InstalledModelRow({ row, onPicked }: InstalledModelRowProps) {
  const handleClick = () => {
    toggleToolModel(row.toolId, row.model.id, row.selected);
    onPicked();
  };

  return (
    <div
      className={
        row.selected ? "installed-model-row installed-model-row--selected" : "installed-model-row"
      }
    >
      <Flex align="center" justify="between" gap="s">
        <Flex direction="column" gap="xxs" grow className="installed-model-row__text">
          <BodyStrong as="span" truncate title={row.model.name}>
            {row.model.name}
          </BodyStrong>
          {row.model.detail && (
            <Meta as="span" truncate>
              {row.model.detail}
            </Meta>
          )}
        </Flex>
        <Button
          appearance={row.selected ? "secondary" : "primary"}
          aria-pressed={row.selected}
          title={row.selected ? "Clear this model" : "Use this model"}
          onClick={handleClick}
        >
          {row.selected ? "Selected" : "Select"}
        </Button>
      </Flex>
    </div>
  );
}
