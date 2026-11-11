import { useToolStore } from "../../../stores/toolStore";
import { Flex } from "../../ui/Flex/Flex";
import { RetryBlock } from "../../ui/RetryBlock/RetryBlock";
import { SkeletonBlock } from "../../ui/Skeletons/SkeletonBlock";
import { Body, Meta } from "../../ui/Typography/Typography";
import { AllowedFoldersCard } from "./AllowedFoldersCard/AllowedFoldersCard";
import { SearchSourcesBlock } from "./SearchSourcesBlock";
import { ToolCard } from "./ToolCard";

/**
 * Settings > Tools: one card per tool with its three-way state, the search sources under web_search,
 * then the folders the file tools may read. The tool list and the saved settings are read once at
 * startup; a failed read shows a retry and the intro and notes stay on the page.
 */
export default function ToolsSettings() {
  const loaded = useToolStore((s) => s.loaded);
  const loadError = useToolStore((s) => s.loadError);
  const tools = useToolStore((s) => s.tools);
  const load = useToolStore((s) => s.load);
  const failed = !loaded && loadError !== null;

  return (
    <Flex direction="column" gap="m">
      <Body>
        Let models use tools. Every tool starts off. A model only sees the tools you turn on.
      </Body>

      {!loaded && !failed && (
        <Flex direction="column" gap="m">
          <SkeletonBlock height={120} />
          <SkeletonBlock height={160} />
        </Flex>
      )}

      {failed && (
        <RetryBlock
          compact
          error={loadError}
          subject="LocalGenie tools"
          lead="Could not load the tools."
          onRetry={() => void load()}
        />
      )}

      {loaded && tools.length === 0 && <Meta>No tools are available in this build.</Meta>}
      {loaded &&
        tools.map((tool) => (
          <ToolCard key={tool.name} tool={tool}>
            {tool.name === "web_search" && <SearchSourcesBlock />}
          </ToolCard>
        ))}
      {loaded && <AllowedFoldersCard />}

      <Meta>
        A model whose settings scan says it cannot call tools is never sent tools. The file tools
        are read-only: they list and read files and never change them.
      </Meta>
    </Flex>
  );
}
