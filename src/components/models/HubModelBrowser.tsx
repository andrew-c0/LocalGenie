import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowSortRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DismissRegular,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AssetCompat } from "../../services/hubApi";
import {
  type HubFilter,
  LIBRARY_CHIPS,
  LICENSE_CHIPS,
  modelTagChips,
  PIPELINE_TAG_CHIPS,
  QUANTIZATION_CHIPS,
} from "../../services/hubApi";
import { useHubBrowseStore } from "../../stores/hubBrowseStore";
import { ErrorBanner } from "../ui/ErrorBanner/ErrorBanner";
import { ModelCard, type ModelCardData } from "../ui/ModelCard/ModelCard";
import { StateBlock } from "../ui/primitives";

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

const SORT_OPTIONS: [string, string][] = [
  ["downloads", "Most downloads"],
  ["likes", "Most likes"],
  ["lastModified", "Recently updated"],
  ["trendingScore", "Trending"],
  ["createdAt", "Newest"],
];

const CHIP_GROUPS: [string, readonly string[], HubFilter["type"]][] = [
  ["Task", PIPELINE_TAG_CHIPS, "pipeline_tag"],
  ["Library", LIBRARY_CHIPS, "library"],
  ["License", LICENSE_CHIPS, "license"],
  ["Quantization", QUANTIZATION_CHIPS, "quantization"],
];

interface Props {
  /** Which hub area to browse — controlled by the parent page tabs. */
  area: "qualcomm" | "all";
  downloading: Set<string>;
}

/** Hugging Face browse area with sorting, filter chips and cursor pagination. */
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

  const activeFilterCount = s.filters.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Search + sort */}
      <div className="lx-model-toolbar">
        <div className="lx-search">
          <input
            placeholder={
              s.area === "qualcomm"
                ? "Search Qualcomm AI Hub models…"
                : "Search all Hugging Face models…"
            }
            value={s.search}
            onChange={(e) => s.setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void s.refresh();
            }}
            aria-label="Search Hugging Face models"
          />
          <Button size="small" appearance="primary" onClick={() => void s.refresh()}>
            {s.isLoading ? <Spinner size="tiny" /> : "Search"}
          </Button>
        </div>
        <select
          className="lx-select"
          value={s.sort}
          onChange={(e) => s.setSort(e.target.value as never)}
          aria-label="Sort models"
        >
          {SORT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          size="small"
          appearance="secondary"
          icon={<ArrowSortRegular />}
          onClick={s.toggleAscending}
          title={s.ascending ? "Ascending" : "Descending"}
        >
          {s.ascending ? "Asc" : "Desc"}
        </Button>
        {area === "all" && (
          <button
            type="button"
            className={`lx-chip${s.ggufOnly ? " active" : ""}`}
            onClick={() => s.setGgufOnly(!s.ggufOnly)}
            aria-pressed={s.ggufOnly}
            title="Show only models with GGUF weights (runnable by GenieX)"
          >
            GGUF only
          </button>
        )}
      </div>

      {/* Filter chips (collapsible, collapsed by default) */}
      <button
        type="button"
        className="lx-files-toggle"
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((v) => !v)}
        style={{ alignSelf: "flex-start" }}
      >
        {filtersOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
          Filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}
        </span>
      </button>
      {filtersOpen && (
        <>
          {CHIP_GROUPS.map(([label, values, type]) => (
            <fieldset
              key={type}
              className="lx-chiprow"
              style={{ border: "none", padding: 0, margin: 0 }}
            >
              <legend className="lx-visually-hidden">{label} filters</legend>
              <span style={{ fontSize: 12, color: "var(--lx-text-muted)", minWidth: 80 }}>
                {label}
              </span>
              {values.map((value) => {
                const active = s.filters.some((f) => f.type === type && f.value === value);
                return (
                  <button
                    key={value}
                    type="button"
                    className={`lx-chip${active ? " active" : ""}`}
                    onClick={() => s.toggleFilter({ type, value })}
                  >
                    {value}
                  </button>
                );
              })}
            </fieldset>
          ))}

          {activeFilterCount > 0 && (
            <div className="lx-chiprow">
              <button type="button" className="lx-chip" onClick={s.clearFilters}>
                <DismissRegular /> Clear {activeFilterCount} filter(s)
              </button>
            </div>
          )}
        </>
      )}

      {s.error && <ErrorBanner message={s.error} />}

      {/* Results */}
      {s.isLoading ? (
        <StateBlock icon="⏳" message="Loading models from Hugging Face…" />
      ) : s.models.length === 0 ? (
        <StateBlock icon="🔍" message="No models match the current filters." />
      ) : (
        <div className="lx-model-grid">
          {s.models.map((m) => {
            const isDownloading = downloading.has(m.id);
            const openDetail = () =>
              navigate(`/models/${encodeURIComponent(m.id)}`, { state: { isLocal: false } });
            const cardData: ModelCardData = {
              name: m.id,
              installed: false,
              downloads: m.downloads,
              likes: m.likes,
              pipelineTag: modelTagChips(m)[0],
              badge:
                area === "qualcomm" && compatibleNames
                  ? (() => {
                      const b = compatBadge(assetCompat[m.id], compatibleNames.has(m.id));
                      return { tone: b.tone, label: b.label };
                    })()
                  : undefined,
              gated: m.gated ? true : undefined,
            };
            return (
              <ModelCard
                key={m._id}
                model={cardData}
                isLocal={false}
                isLoaded={false}
                isDownloading={isDownloading}
                onOpenSelector={openDetail}
                onDetails={(name, isLocal) =>
                  navigate(`/models/${encodeURIComponent(name)}`, { state: { isLocal } })
                }
              />
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {s.nextCursor && !s.isLoading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
          <Button
            appearance="secondary"
            onClick={() => void s.fetchMore()}
            disabled={s.isFetchingMore}
          >
            {s.isFetchingMore ? <Spinner size="tiny" /> : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
