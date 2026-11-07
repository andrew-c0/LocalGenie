import { SearchBox } from "@fluentui/react-components";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PlaygroundCatalogSection } from "../../components/models/PlaygroundModelsCatalog/PlaygroundCatalogSection";
import { usePlaygroundModelsCatalog } from "../../components/models/PlaygroundModelsCatalog/usePlaygroundModelsCatalog";
import { ChipRow } from "../../components/ui/ChipRow/ChipRow";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../../components/ui/Flex/Flex";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { RetryBlock } from "../../components/ui/RetryBlock/RetryBlock";
import { SkeletonRows } from "../../components/ui/Skeletons/SkeletonRows";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { routeById } from "../../navigation/routeUtils";
import { deleteBodyOf } from "../../utils/playgroundLocalModels";
import {
  catalogSectionsOf,
  filterCatalogRows,
  INSTALLED_FILTER_OPTIONS,
  type InstalledFilter,
  TOOL_FILTER_OPTIONS,
  type ToolFilter,
  toolFilterOf,
} from "../../utils/playgroundModelsCatalog";
import { deleteModelTitle } from "../../utils/playgroundText";
import "./PlaygroundModelsPage.css";

/**
 * Playground models (`/models/playground`): every curated Playground model with its state, installed or
 * not, grouped by tool. Download and delete happen here; the Playground selector only lists the installed
 * ones. `?tool=<group>` opens the page on one tool.
 */
export default function PlaygroundModelsPage() {
  const route = routeById("models-playground");
  const [params, setParams] = useSearchParams();
  const tool = toolFilterOf(params.get("tool"));
  const [installed, setInstalled] = useState<InstalledFilter>("all");
  const [query, setQuery] = useState("");
  const catalog = usePlaygroundModelsCatalog();

  const sections = useMemo(
    () => catalogSectionsOf(filterCatalogRows(catalog.rows, { tool, installed, query })),
    [catalog.rows, tool, installed, query],
  );
  const isFiltered = tool !== "all" || installed !== "all" || query.trim() !== "";
  /** The empty note waits until every catalog has loaded and none failed, so it never sits by an error. */
  const isSettled = !catalog.isLoading && catalog.failures.length === 0;

  const chooseTool = (value: ToolFilter) =>
    setParams(value === "all" ? {} : { tool: value }, { replace: true });

  return (
    <div className="playground-models-page__page">
      <div className="playground-models-page__inner">
        <PageHeader title={route?.title} subtitle={route?.description} />

        <Flex direction="column" gap="s">
          <ChipRow
            options={TOOL_FILTER_OPTIONS}
            value={tool}
            onChange={chooseTool}
            ariaLabel="Playground tool"
          />
          <ChipRow
            options={INSTALLED_FILTER_OPTIONS}
            value={installed}
            onChange={setInstalled}
            ariaLabel="Installed state"
          />
          <div className="playground-models-page__toolbar">
            <SearchBox
              className="playground-models-page__search"
              placeholder="Filter by model name"
              aria-label="Filter Playground models by name"
              value={query}
              onChange={(_, data) => setQuery(data.value)}
            />
          </div>
        </Flex>

        {catalog.failures.map((failure) => (
          <RetryBlock
            key={failure.kind}
            compact
            error={failure.message}
            subject="the Playground"
            onRetry={failure.retry}
          />
        ))}

        {catalog.isLoading && <SkeletonRows count={4} variant="card" />}

        {sections.map((section) => (
          <PlaygroundCatalogSection
            key={section.group}
            section={section}
            isAnyDownloading={catalog.isAnyDownloading}
            deletingModelId={catalog.deletingModelId}
            onDelete={catalog.requestDelete}
          />
        ))}

        {isSettled && sections.length === 0 && (
          <StateBlock
            icon="🔍"
            message={
              isFiltered
                ? "No Playground models match these filters."
                : "No Playground models are listed."
            }
          />
        )}

        {catalog.pendingModel && (
          <ConfirmDialog
            title={deleteModelTitle(catalog.pendingModel.label)}
            message={deleteBodyOf(catalog.pendingModel)}
            confirmLabel="Delete"
            onConfirm={catalog.confirmDelete}
            onCancel={catalog.cancelDelete}
          />
        )}
      </div>
    </div>
  );
}
