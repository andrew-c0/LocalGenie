import { Button, Divider, PopoverSurface } from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";
import { routeById } from "../../../../../navigation/routeUtils";
import type { PlaygroundModelKind } from "../../../../../types";
import { installedGroups, type ToolModels } from "../../../../../utils/playgroundSelector";
import type { PlaygroundCatalogs } from "../../../../playground/usePlaygroundCatalogs";
import { Flex } from "../../../../ui/Flex/Flex";
import { RetryBlock } from "../../../../ui/RetryBlock/RetryBlock";
import { SkeletonRows } from "../../../../ui/Skeletons/SkeletonRows";
import type { PlaygroundSelectorData } from "../usePlaygroundSelectorData";
import { ComputeRunOnRow } from "./ComputeRunOnRow/ComputeRunOnRow";
import { InstalledModelsView } from "./InstalledModelsView/InstalledModelsView";
import "./PlaygroundSelectorContent.css";

/** The Playground models page, from the route table. */
const PLAYGROUND_MODELS_PATH = routeById("models-playground")?.path ?? "/models";

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
 * The Playground selector's popover: the page's "Run on" rows, then the installed models of the listed
 * tools, then a "More models" link to the Playground models page. A failed catalog shows its retry
 * above the list, and the models that did load stay listed. The empty note only shows when nothing
 * failed and nothing is still loading.
 */
export function PlaygroundSelectorContent({ data, onPicked }: PlaygroundSelectorContentProps) {
  const { tools, currentTool, catalogs, computeRows, compute } = data;
  const navigate = useNavigate();
  const failures = failuresOf(tools, catalogs);
  const isLoading = tools.some(
    (tool) => tool.models === null && catalogs[tool.catalog].loadError === null,
  );
  const isSettled = !isLoading && failures.length === 0;

  /** Closes the popover and opens the Playground models page, on the page's tool when there is one. */
  const openModelsPage = (search: string) => {
    onPicked();
    navigate(`${PLAYGROUND_MODELS_PATH}${search}`);
  };
  const getModels = () =>
    openModelsPage(currentTool ? `?tool=${encodeURIComponent(currentTool.group)}` : "");

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

      <InstalledModelsView
        groups={installedGroups(tools)}
        currentTool={currentTool}
        showToolNames={currentTool === null}
        isSettled={isSettled}
        onPicked={onPicked}
        onGetModels={getModels}
      />

      <Divider />
      <Flex justify="end">
        <Button appearance="subtle" onClick={() => openModelsPage("")}>
          More models
        </Button>
      </Flex>
    </PopoverSurface>
  );
}
