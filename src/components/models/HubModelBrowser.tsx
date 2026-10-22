import type { DropdownProps } from "@fluentui/react-components";
import {
  Button,
  Caption1,
  Dropdown,
  makeStyles,
  Option,
  SearchBox,
  Spinner,
  Switch,
  ToggleButton,
  tokens,
} from "@fluentui/react-components";
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
  type HubSort,
  LIBRARY_CHIPS,
  LICENSE_CHIPS,
  modelTagChips,
  PIPELINE_TAG_CHIPS,
  QUANTIZATION_CHIPS,
} from "../../services/hubApi";
import { useHubBrowseStore } from "../../stores/hubBrowseStore";
import { ErrorBanner } from "../ui/ErrorBanner/ErrorBanner";
import { ModelCard, type ModelCardData } from "../ui/ModelCard/ModelCard";
import { StateBlock } from "../ui/StateBlock/StateBlock";

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

const CHIP_GROUPS: [string, readonly string[], HubFilter["type"]][] = [
  ["Task", PIPELINE_TAG_CHIPS, "pipeline_tag"],
  ["Library", LIBRARY_CHIPS, "library"],
  ["License", LICENSE_CHIPS, "license"],
  ["Quantization", QUANTIZATION_CHIPS, "quantization"],
];

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  search: {
    flex: 1,
    minWidth: "240px",
  },
  sort: {
    minWidth: "180px",
  },
  filters: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  group: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    border: "none",
    margin: 0,
    padding: 0,
    minWidth: 0,
  },
  groupLabel: {
    minWidth: "80px",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  center: {
    display: "flex",
    justifyContent: "center",
    padding: `${tokens.spacingVerticalS} 0`,
  },
});

interface Props {
  /** Which hub area to browse — controlled by the parent page tabs. */
  area: "qualcomm" | "all";
  downloading: Set<string>;
}

/** Hugging Face browse area with sorting, filter chips and cursor pagination. */
export default function HubModelBrowser({ area, downloading }: Props) {
  const styles = useStyles();
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
  const sortLabel = SORT_OPTIONS.find(([value]) => value === s.sort)?.[1] ?? "";

  const handleSortSelect: DropdownProps["onOptionSelect"] = (_, data) => {
    const next = SORT_OPTIONS.find(([value]) => value === data.optionValue);
    if (next) s.setSort(next[0]);
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <SearchBox
          className={styles.search}
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
        <Button appearance="primary" size="small" onClick={() => void s.refresh()}>
          {s.isLoading ? <Spinner size="tiny" /> : "Search"}
        </Button>
        <Dropdown
          className={styles.sort}
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
          size="small"
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

      <Button
        appearance="subtle"
        size="small"
        icon={filtersOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
        aria-expanded={filtersOpen}
        onClick={() => setFiltersOpen((v) => !v)}
        className={styles.toolbar}
      >
        Filters{activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}
      </Button>

      {filtersOpen && (
        <div className={styles.filters}>
          {CHIP_GROUPS.map(([label, values, type]) => (
            <fieldset key={type} className={styles.group} aria-label={`${label} filters`}>
              <Caption1 className={styles.groupLabel}>{label}</Caption1>
              {values.map((value) => (
                <ToggleButton
                  key={value}
                  size="small"
                  checked={s.filters.some((f) => f.type === type && f.value === value)}
                  onClick={() => s.toggleFilter({ type, value })}
                >
                  {value}
                </ToggleButton>
              ))}
            </fieldset>
          ))}

          {activeFilterCount > 0 && (
            <div>
              <Button
                size="small"
                appearance="subtle"
                icon={<DismissRegular />}
                onClick={s.clearFilters}
              >
                Clear {activeFilterCount} filter(s)
              </Button>
            </div>
          )}
        </div>
      )}

      {s.error && <ErrorBanner message={s.error} />}

      {s.isLoading ? (
        <StateBlock icon="⏳" message="Loading models from Hugging Face…" />
      ) : s.models.length === 0 ? (
        <StateBlock icon="🔍" message="No models match the current filters." />
      ) : (
        <div className={styles.grid}>
          {s.models.map((m) => {
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
        <div className={styles.center}>
          <Button
            appearance="secondary"
            size="small"
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
