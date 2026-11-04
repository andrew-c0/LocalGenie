import type { DropdownProps } from "@fluentui/react-components";
import { Button, Dropdown, Option, SearchBox, Spinner, Switch } from "@fluentui/react-components";
import { ArrowSortRegular, ChevronDownRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSystemMemory } from "../../../hooks/useSystemMemory";
import type { HubSort } from "../../../services/hubApi";
import { activeFacetCount, useHubBrowseStore } from "../../../stores/hubBrowseStore";
import { baseModelOf } from "../../../utils/hubModelInfo";
import { Flex } from "../../ui/Flex/Flex";
import { ModelCard } from "../../ui/ModelCard/ModelCard";
import { hubCardData } from "../../ui/ModelCard/modelCardData";
import { RetryBlock } from "../../ui/RetryBlock/RetryBlock";
import { SkeletonRows } from "../../ui/Skeletons/SkeletonRows";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { HubFacetPanel } from "./HubFacetPanel/HubFacetPanel";
import "./HubModelBrowser.css";

const SORT_OPTIONS: [HubSort, string][] = [
  ["downloads", "Most downloads"],
  ["likes", "Most likes"],
  ["lastModified", "Recently updated"],
  ["trendingScore", "Trending"],
  ["createdAt", "Newest"],
];

interface Props {
  downloading: Set<string>;
}

/** Hugging Face browse with sorting, facet filters and cursor pagination. */
export default function HubModelBrowser({ downloading }: Props) {
  const s = useHubBrowseStore();
  const navigate = useNavigate();
  const { models, isLoading, error, refresh } = s;
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Read once here for every card; the RAM verdict is derived per model below.
  const systemMemory = useSystemMemory();

  useEffect(() => {
    if (models.length === 0 && !isLoading && !error) void refresh();
  }, [models.length, isLoading, error, refresh]);

  const activeFilterCount = activeFacetCount(s.facets);
  const sortLabel = SORT_OPTIONS.find(([value]) => value === s.sort)?.[1] ?? "";
  // "Base models only" is applied to the loaded page: the Hub has no filter for it.
  const shown = s.facets.baseOnly ? s.models.filter((m) => baseModelOf(m.tags) === null) : s.models;

  /** The list area: a skeleton while loading, the retry for a failed first load, a text, or the cards. */
  const resultsView = (): ReactNode => {
    if (s.isLoading) return <SkeletonRows count={8} variant="card" />;
    // A failed first load shows only the retry, not the "no models" text.
    if (s.error && shown.length === 0) {
      return <RetryBlock error={s.error} subject="Hugging Face" onRetry={() => void s.refresh()} />;
    }
    if (shown.length === 0) {
      return <StateBlock icon="🔍" message="No models match the current filters." />;
    }
    return (
      <Flex direction="column" gap="s">
        {s.error && (
          <RetryBlock
            compact
            error={s.error}
            subject="Hugging Face"
            onRetry={() => void s.refresh()}
          />
        )}
        {shown.map((m) => (
          <ModelCard
            key={m._id}
            model={hubCardData(m, systemMemory)}
            isLoaded={false}
            isDownloading={downloading.has(m.id)}
            onDetails={(name) => navigate(`/models/huggingface/${encodeURIComponent(name)}`)}
          />
        ))}
        {s.isFetchingMore && <SkeletonRows count={3} variant="card" />}
      </Flex>
    );
  };

  const handleSortSelect: DropdownProps["onOptionSelect"] = (_, data) => {
    const next = SORT_OPTIONS.find(([value]) => value === data.optionValue);
    if (next) s.setSort(next[0]);
  };

  return (
    <div className="hub-model-browser__root">
      <div className="hub-model-browser__toolbar">
        <SearchBox
          className="hub-model-browser__search"
          placeholder="Search all Hugging Face models…"
          aria-label="Search Hugging Face models"
          value={s.search}
          onChange={(_, data) => s.setSearch(data.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void s.refresh();
          }}
        />
        <Button appearance="primary" onClick={() => void s.refresh()}>
          {s.isLoading ? <Spinner size="tiny" /> : "Search"}
        </Button>
        <Button
          appearance="secondary"
          icon={filtersOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}
        </Button>
      </div>

      {filtersOpen && (
        <div className="hub-model-browser__filters">
          <div className="hub-model-browser__toolbar">
            <Dropdown
              className="hub-model-browser__sort"
              aria-label="Sort models"
              value={sortLabel}
              selectedOptions={[s.sort]}
              onOptionSelect={handleSortSelect}
            >
              {SORT_OPTIONS.map(([value, label]) => (
                <Option key={value} value={value}>
                  {label}
                </Option>
              ))}
            </Dropdown>
            <Button
              appearance="secondary"
              icon={<ArrowSortRegular />}
              onClick={s.toggleAscending}
              title={s.ascending ? "Ascending" : "Descending"}
            >
              {s.ascending ? "Asc" : "Desc"}
            </Button>
            <Switch
              label="GGUF only"
              checked={s.ggufOnly}
              onChange={(_, data) => s.setGgufOnly(data.checked)}
              title="Show only models with GGUF weights (runnable by GenieX)"
            />
          </div>

          <HubFacetPanel />
        </div>
      )}

      {resultsView()}

      {s.nextCursor && !s.isLoading && (
        <div className="hub-model-browser__center">
          {s.loadMoreError ? (
            <RetryBlock
              compact
              error={s.loadMoreError}
              subject="Hugging Face"
              onRetry={() => void s.fetchMore()}
            />
          ) : (
            <Button
              appearance="secondary"
              disabled={s.isFetchingMore}
              onClick={() => void s.fetchMore()}
            >
              {s.isFetchingMore ? <Spinner size="tiny" /> : "Load more"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
