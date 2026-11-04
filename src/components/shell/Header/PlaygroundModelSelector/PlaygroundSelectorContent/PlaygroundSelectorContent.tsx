import { Button, Divider, PopoverSurface } from "@fluentui/react-components";
import type { PlaygroundModelKind } from "../../../../../types";
import { selectorSections, type ToolModels } from "../../../../../utils/playgroundSelector";
import type { PlaygroundCatalogs } from "../../../../playground/usePlaygroundCatalogs";
import { Flex } from "../../../../ui/Flex/Flex";
import { RetryBlock } from "../../../../ui/RetryBlock/RetryBlock";
import { SkeletonRows } from "../../../../ui/Skeletons/SkeletonRows";
import { Meta } from "../../../../ui/Typography/Typography";
import type { PlaygroundSelectorData } from "../usePlaygroundSelectorData";
import { ComputeRunOnRow } from "./ComputeRunOnRow/ComputeRunOnRow";
import { SelectorSectionView } from "./SelectorSectionView/SelectorSectionView";
import "./PlaygroundSelectorContent.css";

const FIND_MORE_LABEL = "Find more on Hugging Face";

/** A catalog that failed to read, with its message and the call that reads it again. */
interface CatalogFailure {
  catalog: PlaygroundModelKind;
  message: string;
  retry: () => void;
}

/** The distinct catalogs the listed tools read, in tool order. */
function catalogsOf(tools: ToolModels[]): PlaygroundModelKind[] {
  return tools
    .map((tool) => tool.catalog)
    .filter((catalog, index, all) => all.indexOf(catalog) === index);
}

/** The catalogs the listed tools read that failed, with the retry for each. */
function failuresOf(tools: ToolModels[], catalogs: PlaygroundCatalogs): CatalogFailure[] {
  return catalogsOf(tools).flatMap((catalog) => {
    const load = catalogs[catalog];
    return load.loadError === null ? [] : [{ catalog, message: load.loadError, retry: load.retry }];
  });
}

interface PlaygroundSelectorContentProps {
  data: PlaygroundSelectorData;
  /** Closes the popover after a model is picked. */
  onPicked: () => void;
}

/**
 * The Playground selector's popover: the page's "Run on" rows, then the Installed and Recommended
 * sections of the listed tools, then a disabled "Find more" row. A failed catalog shows its retry
 * above the sections, and the models that did load stay listed. An empty section's note only shows
 * when nothing failed and nothing is still loading.
 */
export function PlaygroundSelectorContent({ data, onPicked }: PlaygroundSelectorContentProps) {
  const { tools, catalogs, computeRows, compute, isAnyDownloading } = data;
  const failures = failuresOf(tools, catalogs);
  const isLoading = tools.some(
    (tool) => tool.models === null && catalogs[tool.catalog].loadError === null,
  );
  const isSettled = !isLoading && failures.length === 0;

  return (
    <PopoverSurface className="playground-selector" aria-label="Switch Playground model">
      {computeRows.length > 0 && (
        <Flex direction="column" gap="s">
          {computeRows.map((row) => (
            <ComputeRunOnRow
              key={row.label}
              row={row}
              error={row.setting === "device" ? compute.error : null}
              refresh={row.setting === "device" ? compute : undefined}
            />
          ))}
          <Divider />
        </Flex>
      )}

      {failures.map((failure) => (
        <RetryBlock
          key={failure.catalog}
          compact
          error={failure.message}
          subject="the Playground"
          onRetry={failure.retry}
        />
      ))}

      {isLoading && <SkeletonRows count={3} />}

      <SelectorSectionView
        sections={selectorSections(tools)}
        showToolNames={data.currentTool === null}
        isSettled={isSettled}
        isAnyDownloading={isAnyDownloading}
        onPicked={onPicked}
      />

      <Divider />
      <Flex align="center" justify="between" gap="m">
        <Button appearance="secondary" disabled>
          {FIND_MORE_LABEL}
        </Button>
        <Meta>Coming soon</Meta>
      </Flex>
    </PopoverSurface>
  );
}
