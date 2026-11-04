import type { SelectorSection } from "../../../../../../utils/playgroundSelector";
import { Flex } from "../../../../../ui/Flex/Flex";
import { BodyStrong, Meta } from "../../../../../ui/Typography/Typography";
import { InstalledModelRow } from "../InstalledModelRow/InstalledModelRow";
import { RecommendedModelRow } from "../RecommendedModelRow/RecommendedModelRow";

const INSTALLED_EMPTY_TEXT = "No models installed yet.";

interface SelectorSectionViewProps {
  sections: SelectorSection[];
  /** Names each tool's group. Shown on the landing, where several tools are listed. */
  showToolNames: boolean;
  /** Nothing is loading or failed, so an empty Installed section can say it is empty. */
  isSettled: boolean;
  /** Another Playground download is running. Downloads run one at a time. */
  isAnyDownloading: boolean;
  /** Closes the popover after a model is picked. */
  onPicked: () => void;
}

/** The Installed and Recommended sections, each with its tools' rows. */
export function SelectorSectionView({
  sections,
  showToolNames,
  isSettled,
  isAnyDownloading,
  onPicked,
}: SelectorSectionViewProps) {
  return (
    <>
      {sections.map((section) => (
        <Flex key={section.id} direction="column" gap="s">
          <BodyStrong>{section.title}</BodyStrong>
          {section.id === "installed" && section.groups.length === 0 && isSettled && (
            <Meta>{INSTALLED_EMPTY_TEXT}</Meta>
          )}
          {section.groups.map((group) => (
            <Flex key={group.toolId} direction="column" gap="xs">
              {showToolNames && <Meta>{group.title}</Meta>}
              {group.rows.map((row) =>
                section.id === "installed" ? (
                  <InstalledModelRow key={row.model.id} row={row} onPicked={onPicked} />
                ) : (
                  <RecommendedModelRow
                    key={row.model.id}
                    row={row}
                    isOtherDownloading={isAnyDownloading}
                  />
                ),
              )}
            </Flex>
          ))}
        </Flex>
      ))}
    </>
  );
}
