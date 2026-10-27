import type { DropdownProps } from "@fluentui/react-components";
import { Button, Dropdown, Option, SearchBox, Spinner, Switch } from "@fluentui/react-components";
import { ArrowSortRegular, ChevronDownRegular, ChevronRightRegular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AssetCompat, HubSort } from "../../../services/hubApi";
import { activeFacetCount, useHubBrowseStore } from "../../../stores/hubBrowseStore";
import { baseModelOf, facetSummaryFromModel } from "../../../utils/hubModelInfo";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { ModelCard, type ModelCardData } from "../../ui/ModelCard/ModelCard";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import { HubFacetPanel } from "./HubFacetPanel/HubFacetPanel";
import "./HubModelBrowser.css";

/** Badge for a Qualcomm tile based on learned compatibility info. */
function compatBadge(
  compat: AssetCompat | undefined,
  npuReady: boolean,
): { tone: "green" | "default"; label: string } {
  if (npuReady) return { tone: "green", label: "NPU ready" };
  if (compat === "universal") return { tone: "green", label: "Universal assets" };
  if (compat === "chipset") return { tone: "green", label: "Chipset assets" };
  if (compat === "none") return { tone: "default", label: "No compatible assets" };
  return { tone: "default", label: "Check assets" };
}

const SORT_OPTIONS: [HubSort, string][] = [
  ["downloads", "Most downloads"],
  ["likes", "Most likes"],
  ["lastModified", "Recently updated"],
  ["trendingScore", "Trending"],
  ["createdAt", "Newest"],
];

interface Props {
  /** Which hub area to browse — controlled by the parent page tabs. */
  area: "qualcomm" | "all";
  downloading: Set<string>;
}

/** Hugging Face browse area with sorting, facet filters and cursor pagination. */
export default function HubModelBrowser({ area, downloading }: Props) {
  const s = useHubBrowseStore();
  const navigate = useNavigate();
  const compatibleNames = useHubBrowseStore((st) => st.compatibleNames);
  const assetCompat = useHubBrowseStore((st) => st.assetCompat);
  const { models, isLoading, error, refresh, area: storeArea, setArea } = s;
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (models.length === 0 && !isLoading && !error) void refresh();
  }, [models.length, isLoading, error, refresh]);

  // Re-fetch when the parent switches area.
  useEffect(() => {
    if (storeArea !== area) setArea(area);
  }, [area, storeArea, setArea]);

  const activeFilterCount = activeFacetCount(s.facets);
  const sortLabel = SORT_OPTIONS.find(([value]) => value === s.sort)?.[1] ?? "";
  // "Base models only" is applied to the loaded page: the Hub has no filter for it.
  const shown = s.facets.baseOnly ? s.models.filter((m) => baseModelOf(m.tags) === null) : s.models;

  const handleSortSelect: DropdownProps["onOptionSelect"] = (_, data) => {
    const next = SORT_OPTIONS.find(([value]) => value === data.optionValue);
    if (next) s.setSort(next[0]);
  };

  return (
    <div className="hub-model-browser__root">
      <div className="hub-model-browser__toolbar">
        <SearchBox
          className="hub-model-browser__search"
          placeholder={
            area === "qualcomm"
              ? "Search Qualcomm AI Hub models…"
              : "Search all Hugging Face models…"
          }
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
            {area === "all" && (
              <Switch
                label="GGUF only"
                checked={s.ggufOnly}
                onChange={(_, data) => s.setGgufOnly(data.checked)}
                title="Show only models with GGUF weights (runnable by GenieX)"
              />
            )}
          </div>

          <HubFacetPanel />
        </div>
      )}

      {s.error && <ErrorBanner message={s.error} />}

      {s.isLoading ? (
        <StateBlock icon="⏳" message="Loading models from Hugging Face…" />
      ) : shown.length === 0 ? (
        <StateBlock icon="🔍" message="No models match the current filters." />
      ) : (
        <div className="hub-model-browser__grid">
          {shown.map((m) => {
            const openDetail = () =>
              navigate(`/models/${encodeURIComponent(m.id)}`, { state: { isLocal: false } });
            const cardData: ModelCardData = {
              name: m.id,
              installed: false,
              downloads: m.downloads,
              likes: m.likes,
              facets: facetSummaryFromModel(m),
              badge:
                area === "qualcomm" && compatibleNames
                  ? compatBadge(assetCompat[m.id], compatibleNames.has(m.id))
                  : undefined,
              gated: m.gated ? true : undefined,
            };
            return (
              <ModelCard
                key={m._id}
                model={cardData}
                isLocal={false}
                isLoaded={false}
                isDownloading={downloading.has(m.id)}
                onOpenSelector={openDetail}
                onDetails={(name, isLocal) =>
                  navigate(`/models/${encodeURIComponent(name)}`, { state: { isLocal } })
                }
              />
            );
          })}
        </div>
      )}

      {s.nextCursor && !s.isLoading && (
        <div className="hub-model-browser__center">
          <Button
            appearance="secondary"
            disabled={s.isFetchingMore}
            onClick={() => void s.fetchMore()}
          >
            {s.isFetchingMore ? <Spinner size="tiny" /> : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
