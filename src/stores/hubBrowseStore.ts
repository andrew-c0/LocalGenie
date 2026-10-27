import { create } from "zustand";
import * as geniex from "../services/geniex";
import {
  type AssetCompat,
  type HubModel,
  type HubQuery,
  type HubSort,
  listHubModels,
  listQualcommModels,
} from "../services/hubApi";
import type { BaseRelation } from "../utils/hubModelInfo";

const ALL_PAGE_SIZE = 30;
/** Qualcomm AI Hub has few chipset-compatible models, so fetch large pages to intersect against. */
const QUALCOMM_PAGE_SIZE = 100;
/** Debounce window for rapid filter/search changes before refetching. */
const REFRESH_DEBOUNCE_MS = 300;
/** How long a cached result stays fresh before a background revalidation. */
const CACHE_TTL_MS = 60_000;

export type HubArea = "all" | "qualcomm";
/** Which top tab is active on the Models page (survives navigation). */
export type ModelTab = "local" | HubArea;

/** The facet filters of the browse panel. Every field except `baseOnly` is sent to the Hub. */
export interface HubFacetFilters {
  /** Pipeline id, e.g. `text-generation`. */
  task: string | null;
  library: string | null;
  /** Licence id, e.g. `apache-2.0`. */
  license: string | null;
  /** Quantisation bits picked from 4 and 8. */
  quantBits: number[];
  /** Parameter bounds in billions. Null is open-ended. */
  paramMin: number | null;
  paramMax: number | null;
  /** Model tree: the relation used with `baseRepo`. */
  baseRelation: BaseRelation;
  /** Base repo id. The tree filter applies only when this is set. */
  baseRepo: string;
  /** Hide models that have a base model. Applied to the loaded page, not sent to the Hub. */
  baseOnly: boolean;
}

export const DEFAULT_FACETS: HubFacetFilters = {
  task: null,
  library: null,
  license: null,
  quantBits: [],
  paramMin: null,
  paramMax: null,
  baseRelation: "quantized",
  baseRepo: "",
  baseOnly: false,
};

interface HubBrowseState {
  area: HubArea;
  search: string;
  sort: HubSort;
  ascending: boolean;
  facets: HubFacetFilters;
  /** Show only GGUF models (library:gguf) — on by default for the All HF area. */
  ggufOnly: boolean;
  setGgufOnly: (v: boolean) => void;
  models: HubModel[];
  nextCursor: string | null;
  isLoading: boolean;
  isFetchingMore: boolean;
  /** A filter changed while a page was loading; the next refresh runs once that load ends. */
  refreshQueued: boolean;
  error: string | null;
  /** AI Hub model names GenieX can pull directly on this chipset (from `geniex model list`). */
  compatibleNames: Set<string> | null;
  /**
   * Asset compatibility per repo. Not populated yet: nothing calls setAssetCompat.
   */
  assetCompat: Record<string, AssetCompat>;
  /** Record a learned compatibility for a repo (called by the detail page). */
  setAssetCompat: (repoId: string, compat: AssetCompat) => void;

  setArea: (area: HubArea) => void;
  setSearch: (search: string) => void;
  setSort: (sort: HubSort) => void;
  toggleAscending: () => void;
  /** Set one facet. Every facet except `baseOnly` refetches the first page. */
  setFacet: <K extends keyof HubFacetFilters>(key: K, value: HubFacetFilters[K]) => void;
  clearFacets: () => void;
  /** Reset pagination and fetch the first page. */
  refresh: () => Promise<void>;
  /** Fetch the next page using the stored cursor. */
  fetchMore: () => Promise<void>;
}

/** The query for a search: the same for the first page and the next pages. */
function queryFor(s: QueryFields, cursor?: string): HubQuery {
  const { paramMin, paramMax } = s.facets;
  return {
    search: s.search || undefined,
    sort: s.sort,
    ascending: s.ascending,
    tags: hubTags(s),
    numParams:
      paramMin != null || paramMax != null
        ? { min: paramMin ?? undefined, max: paramMax ?? undefined }
        : undefined,
    limit: s.area === "qualcomm" ? QUALCOMM_PAGE_SIZE : ALL_PAGE_SIZE,
    cursor,
  };
}

/** Fields a query is built from. */
type QueryFields = Pick<HubBrowseState, "area" | "search" | "sort" | "ascending" | "ggufOnly"> & {
  facets: HubFacetFilters;
};

/** How many facet filters are set, for the Filters button. */
export function activeFacetCount(f: HubFacetFilters): number {
  return (
    [f.task, f.library, f.license, f.baseRepo.trim() || null].filter((v) => v != null).length +
    f.quantBits.length +
    [f.paramMin, f.paramMax].filter((v) => v != null).length +
    (f.baseOnly ? 1 : 0)
  );
}

/** Hub tags for the facet filters. `baseOnly` is not a tag. */
function hubTags(s: QueryFields): string[] {
  const f = s.facets;
  const tags: string[] = [];
  if (f.task) tags.push(f.task);
  if (f.library) tags.push(f.library);
  if (f.license) tags.push(`license:${f.license}`);
  for (const bits of f.quantBits) tags.push(`${bits}-bit`);
  const repo = f.baseRepo.trim();
  // The Hub only filters the tree with a relation and a repo together.
  if (repo) tags.push(`base_model:${f.baseRelation}:${repo}`);
  if (s.area === "all" && s.ggufOnly) tags.push("gguf");
  return tags;
}

async function fetchPage(
  state: QueryFields & { cursor?: string },
): Promise<{ models: HubModel[]; nextCursor: string | null }> {
  const query = queryFor(state, state.cursor);
  return state.area === "qualcomm" ? listQualcommModels(query) : listHubModels(query);
}

/** Stable cache key for a first-page query. */
function cacheKey(s: QueryFields): string {
  const q = queryFor(s);
  return JSON.stringify([
    s.area,
    q.search ?? "",
    q.sort,
    q.ascending,
    [...(q.tags ?? [])].sort(),
    q.numParams ?? null,
  ]);
}

interface CacheEntry {
  models: HubModel[];
  nextCursor: string | null;
  at: number;
}

/** Result cache for first-page queries, keyed by cacheKey(). */
const resultCache = new Map<string, CacheEntry>();

/** Module-level debounce timer shared across store instances. */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/** Serial number to discard stale responses after a newer refresh starts. */
let refreshSeq = 0;

export const useHubBrowseStore = create<HubBrowseState>((set, get) => {
  /** Run the refresh that a change made during a load was waiting for. */
  const runQueuedRefresh = () => {
    if (!get().refreshQueued) return;
    set({ refreshQueued: false });
    void get().refresh();
  };

  /** Reset the list and refetch the first page. */
  const changed = (partial: Partial<HubBrowseState>) => {
    set({ ...partial, models: [], nextCursor: null });
    void get().refresh();
  };

  return {
    area: "qualcomm",
    search: "",
    sort: "downloads",
    ascending: false,
    facets: DEFAULT_FACETS,
    ggufOnly: true,
    models: [],
    nextCursor: null,
    isLoading: false,
    isFetchingMore: false,
    refreshQueued: false,
    error: null,
    compatibleNames: null,
    assetCompat: {},
    setAssetCompat: (repoId, compat) =>
      set((state) => ({ assetCompat: { ...state.assetCompat, [repoId]: compat } })),

    setArea: (area) => changed({ area }),
    setSearch: (search) => set({ search }),
    setSort: (sort) => changed({ sort }),
    toggleAscending: () => changed({ ascending: !get().ascending }),
    setFacet: (key, value) => {
      const facets = { ...get().facets, [key]: value };
      if (key === "baseOnly") {
        // Client-side only: the loaded page is filtered in the browser, nothing is refetched.
        set({ facets });
        return;
      }
      changed({ facets });
    },
    clearFacets: () => changed({ facets: DEFAULT_FACETS }),
    setGgufOnly: (v) => changed({ ggufOnly: v }),
    refresh: () => {
      // Debounce: collapse rapid toggles into a single request.
      if (refreshTimer) clearTimeout(refreshTimer);
      return new Promise<void>((resolve) => {
        refreshTimer = setTimeout(() => {
          void (async () => {
            const s = get();
            const key = cacheKey(s);

            // A refresh is already in flight: run this one when it ends, with the latest filters.
            if (s.isLoading) {
              set({ refreshQueued: true });
              resolve();
              return;
            }

            // Serve from cache when fresh.
            const cached = resultCache.get(key);
            if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
              set({ models: cached.models, nextCursor: cached.nextCursor, isLoading: false });
              resolve();
              return;
            }

            const seq = ++refreshSeq;
            set({ isLoading: true, error: null });
            try {
              // For the Qualcomm area, load the chipset-compatible names from
              // `geniex model list` once — used to badge cards and pick the
              // download flow. All models
              // are shown regardless.
              if (s.area === "qualcomm" && !s.compatibleNames) {
                try {
                  const aihub = await geniex.listAihubModels();
                  set({ compatibleNames: new Set(aihub.map((m) => m.name)) });
                } catch {
                  set({ compatibleNames: null }); // CLI missing/failed — no badges
                }
              }
              const page = await fetchPage(s);
              if (seq !== refreshSeq) {
                resolve(); // a newer refresh superseded this one
                return;
              }
              resultCache.set(key, {
                models: page.models,
                nextCursor: page.nextCursor,
                at: Date.now(),
              });
              set({ models: page.models, nextCursor: page.nextCursor, isLoading: false });
            } catch (err) {
              if (seq === refreshSeq) set({ error: String(err), isLoading: false });
            }
            runQueuedRefresh();
            resolve();
          })();
        }, REFRESH_DEBOUNCE_MS);
      });
    },
    fetchMore: async () => {
      const s = get();
      if (!s.nextCursor || s.isFetchingMore) return;
      set({ isFetchingMore: true });
      try {
        const page = await fetchPage({ ...s, cursor: s.nextCursor });
        set({
          models: [...s.models, ...page.models],
          nextCursor: page.nextCursor,
          isFetchingMore: false,
        });
      } catch (err) {
        set({ error: String(err), isFetchingMore: false });
      }
    },
  };
});
