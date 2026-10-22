import { create } from "zustand";
import * as geniex from "../services/geniex";
import {
  type AssetCompat,
  type HubFilter,
  type HubModel,
  type HubSort,
  listHubModels,
  listQualcommModels,
} from "../services/hubApi";

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

interface HubBrowseState {
  area: HubArea;
  search: string;
  sort: HubSort;
  ascending: boolean;
  filters: HubFilter[];
  /** Show only GGUF models (library:gguf) — on by default for the All HF area. */
  ggufOnly: boolean;
  setGgufOnly: (v: boolean) => void;
  models: HubModel[];
  nextCursor: string | null;
  isLoading: boolean;
  isFetchingMore: boolean;
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
  toggleFilter: (filter: HubFilter) => void;
  clearFilters: () => void;
  /** Reset pagination and fetch the first page. */
  refresh: () => Promise<void>;
  /** Fetch the next page using the stored cursor. */
  fetchMore: () => Promise<void>;
}

async function fetchPage(state: {
  area: HubArea;
  search: string;
  sort: HubSort;
  ascending: boolean;
  filters: HubFilter[];
  ggufOnly: boolean;
  cursor?: string;
}): Promise<{ models: HubModel[]; nextCursor: string | null }> {
  const query = {
    search: state.search || undefined,
    sort: state.sort,
    ascending: state.ascending,
    filters: effectiveFilters(state),
    limit: state.area === "qualcomm" ? QUALCOMM_PAGE_SIZE : ALL_PAGE_SIZE,
    cursor: state.cursor,
  };
  return state.area === "qualcomm" ? listQualcommModels(query) : listHubModels(query);
}

/** Effective filters sent to the API — appends the gguf-only library filter. */
function effectiveFilters(s: {
  area: HubArea;
  filters: HubFilter[];
  ggufOnly: boolean;
}): HubFilter[] {
  if (s.area === "all" && s.ggufOnly) {
    return [...s.filters, { type: "library", value: "gguf" }];
  }
  return s.filters;
}

/** Stable cache key for a first-page query. */
function cacheKey(s: {
  area: HubArea;
  search: string;
  sort: HubSort;
  ascending: boolean;
  filters: HubFilter[];
  ggufOnly: boolean;
}): string {
  const f = effectiveFilters(s)
    .map((x) => `${x.type}:${x.value}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
  return `${s.area}::${s.search}::${s.sort}::${s.ascending ? "1" : "0"}::${f}`;
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

export const useHubBrowseStore = create<HubBrowseState>((set, get) => ({
  area: "qualcomm",
  search: "",
  sort: "downloads",
  ascending: false,
  filters: [],
  ggufOnly: true,
  models: [],
  nextCursor: null,
  isLoading: false,
  isFetchingMore: false,
  error: null,
  compatibleNames: null,
  assetCompat: {},
  setAssetCompat: (repoId, compat) =>
    set((state) => ({ assetCompat: { ...state.assetCompat, [repoId]: compat } })),

  setArea: (area) => {
    set({ area, models: [], nextCursor: null });
    void get().refresh();
  },
  setSearch: (search) => set({ search }),
  setSort: (sort) => {
    set({ sort, models: [], nextCursor: null });
    void get().refresh();
  },
  toggleAscending: () => {
    set({ ascending: !get().ascending, models: [], nextCursor: null });
    void get().refresh();
  },
  toggleFilter: (filter) => {
    const filters = get().filters;
    const exists = filters.some((f) => f.type === filter.type && f.value === filter.value);
    set({
      filters: exists
        ? filters.filter((f) => !(f.type === filter.type && f.value === filter.value))
        : [...filters, filter],
      models: [],
      nextCursor: null,
    });
    void get().refresh();
  },
  clearFilters: () => {
    set({ filters: [], models: [], nextCursor: null });
    void get().refresh();
  },
  setGgufOnly: (v) => {
    set({ ggufOnly: v, models: [], nextCursor: null });
    void get().refresh();
  },
  refresh: () => {
    // Debounce: collapse rapid toggles into a single request.
    if (refreshTimer) clearTimeout(refreshTimer);
    return new Promise<void>((resolve) => {
      refreshTimer = setTimeout(() => {
        void (async () => {
          const s = get();
          const key = cacheKey(s);

          // Dedup: a refresh is already in flight — skip stacking requests.
          if (s.isLoading) {
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
}));
