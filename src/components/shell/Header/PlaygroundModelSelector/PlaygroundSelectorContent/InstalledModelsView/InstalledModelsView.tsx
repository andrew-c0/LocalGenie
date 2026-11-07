import { Button } from "@fluentui/react-components";
import type { SelectorGroup, ToolModels } from "../../../../../../utils/playgroundSelector";
import { Flex } from "../../../../../ui/Flex/Flex";
import { BodyStrong, Meta } from "../../../../../ui/Typography/Typography";
import { InstalledModelRow } from "../InstalledModelRow/InstalledModelRow";

const EMPTY_TEXT = "No models installed yet.";

interface InstalledModelsViewProps {
  /** The installed models, by tool, in tool order. */
  groups: SelectorGroup[];
  /** The tool the page shows. Null on the landing, where every tool is listed. */
  currentTool: ToolModels | null;
  /** Names each tool's group. Shown on the landing, where several tools are listed. */
  showToolNames: boolean;
  /** Nothing is loading or failed, so an empty list can say it is empty. */
  isSettled: boolean;
  /** Closes the popover after a model is picked. */
  onPicked: () => void;
  /** Closes the popover and opens the Playground models page. */
  onGetModels: () => void;
}

/**
 * The popover's Installed list. With nothing installed for the listed tools it says so, and offers
 * "Get models", which opens the Playground models page.
 */
export function InstalledModelsView({
  groups,
  currentTool,
  showToolNames,
  isSettled,
  onPicked,
  onGetModels,
}: InstalledModelsViewProps) {
  const emptyText = currentTool ? `No models installed for ${currentTool.title}` : EMPTY_TEXT;

  return (
    <Flex direction="column" gap="s">
      <BodyStrong>Installed</BodyStrong>
      {groups.length === 0 && isSettled && (
        <Flex direction="column" gap="s" align="start">
          <Meta>{emptyText}</Meta>
          <Button appearance="secondary" onClick={onGetModels}>
            Get models
          </Button>
        </Flex>
      )}
      {groups.map((group) => (
        <Flex key={group.toolId} direction="column" gap="xs">
          {showToolNames && <Meta>{group.title}</Meta>}
          {group.rows.map((row) => (
            <InstalledModelRow key={row.model.id} row={row} onPicked={onPicked} />
          ))}
        </Flex>
      ))}
    </Flex>
  );
}
