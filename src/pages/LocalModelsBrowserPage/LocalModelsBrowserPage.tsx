import type { SelectTabData, SelectTabEvent } from "@fluentui/react-components";
import {
  Button,
  Card,
  CardHeader,
  ProgressBar,
  SearchBox,
  Spinner,
  Tab,
  TabList,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AihubBrowser } from "../../components/models/AihubBrowser/AihubBrowser";
import HubModelBrowser from "../../components/models/HubModelBrowser/HubModelBrowser";
import { ChipRow } from "../../components/ui/ChipRow/ChipRow";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../../components/ui/ErrorBanner/ErrorBanner";
import {
  type GGUFFileOption,
  ModelCard,
  type ModelCardData,
} from "../../components/ui/ModelCard/ModelCard";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import * as db from "../../services/database";
import * as geniex from "../../services/geniex";
import * as hub from "../../services/hubModels";
import { isDownloadActive, useDownloadStore } from "../../stores/downloadStore";
import { useModelStore } from "../../stores/modelStore";
import { runWithConcurrency } from "../../utils/async";
import { facetSummaryFromModel } from "../../utils/hubModelInfo";
import { FAMILY_ALL, familyFilterOptions, matchesFamily } from "../../utils/modelFamily";
import { toast } from "../../utils/toast";
import "./LocalModelsBrowserPage.css";
import { Body, Meta } from "../../components/ui/Typography/Typography";

/** Parallel GGUF tree lookups for search results (Hugging Face rate-limits bursts). */
const GGUF_LOOKUP_CONCURRENCY = 4;

/** Browser page for locally installed models, plus Hugging Face search. */
/** Library tabs; each is its own route (`/models`, `/models/browse`, `/models/aihub`). */
type LibraryTab = "local" | "all" | "aihub";

const TAB_PATHS: Record<LibraryTab, string> = {
  local: "/models",
  all: "/models/browse",
  aihub: "/models/aihub",
};

const SUBTITLES: Record<LibraryTab, string> = {
  local: "Models installed on this device, ready to load into the GenieX server.",
  all: "Search Hugging Face for GGUF models and download them to this device.",
  aihub: "Qualcomm AI Hub models with QAIRT assets, read from the public catalog.",
};

export default function LocalModelsBrowserPage({ tab }: { tab: LibraryTab }) {
  const models = useModelStore((s) => s.models);
  const searchResults = useModelStore((s) => s.searchResults);
  const isSearching = useModelStore((s) => s.isSearching);
  const setSearchResults = useModelStore((s) => s.setSearchResults);
  const setIsSearching = useModelStore((s) => s.setIsSearching);
  const downloads = useDownloadStore((s) => s.downloads);
  const activeDownloads = useMemo(
    () => downloads.filter((d) => isDownloadActive(d.status)),
    [downloads],
  );
  const activeIds = useMemo(() => new Set(activeDownloads.map((d) => d.id)), [activeDownloads]);
  const serverStatus = useModelStore((s) => s.serverStatus);

  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState(FAMILY_ALL);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [downloadedMeta, setDownloadedMeta] = useState<Map<string, db.DbDownloadedModel>>(
    new Map(),
  );
  const [ggufCache, setGgufCache] = useState<Map<string, GGUFFileOption[]>>(new Map());
  /** Repo ids with a GGUF lookup queued or running, so re-renders never request them twice. */
  const ggufPending = useRef(new Set<string>());

  // Refresh local model list + DB meta on mount so deleted models disappear.
  useEffect(() => {
    (async () => {
      try {
        const updated = await geniex.listModels();
        useModelStore.getState().setModels(updated);
        const rows = await db.listDownloadedModels();
        setDownloadedMeta(new Map(rows.map((r) => [r.name, r])));
      } catch {
        // ignore
      }
    })();
  }, []);

  const navigate = useNavigate();

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const results = await geniex.searchModels(query);
      setSearchResults(results);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSearching(false);
    }
  }, [query, setIsSearching, setSearchResults]);

  /** Lazily fetch the GGUF file list for a search result card. */
  const ensureGGUF = useCallback(
    async (repoId: string): Promise<GGUFFileOption[]> => {
      const cached = ggufCache.get(repoId);
      if (cached) return cached;
      try {
        const files = await hub.listGGUFFiles(repoId);
        const opts: GGUFFileOption[] = files.map((f) => ({
          filename: f.filename,
          precision: f.precision,
          sizeLabel: f.sizeLabel,
        }));
        setGgufCache((prev) => {
          const next = new Map(prev);
          next.set(repoId, opts);
          return next;
        });
        return opts;
      } catch {
        return [];
      }
    },
    [ggufCache],
  );

  const handleRemove = useCallback(async (model: string) => {
    setError(null);
    try {
      await geniex.removeModel(model);
      toast.success("Model removed", model);
      // Forget the local metadata reference too.
      await db.deleteDownloadedModel(model);
      setDownloadedMeta((prev) => {
        const next = new Map(prev);
        next.delete(model);
        return next;
      });
      const updated = await geniex.listModels();
      useModelStore.getState().setModels(updated);
    } catch (err) {
      setError(String(err));
      toast.error("Could not remove model", `${model}: ${String(err)}`);
    } finally {
      setConfirmRemove(null);
    }
  }, []);

  const openSelector = useCallback(() => {
    setSelectorOpen(true);
  }, [setSelectorOpen]);

  // When search results appear, fetch the GGUF file list for each so the
  // cards can show the variant picker. Best-effort — failures just leave the
  // card with the generic "Details" button. At most GGUF_LOOKUP_CONCURRENCY run at once.
  useEffect(() => {
    const installedNames = new Set(models.map((m) => m.name));
    const pending = searchResults
      .map((r) => r.id)
      .filter(
        (id) => !installedNames.has(id) && !ggufCache.has(id) && !ggufPending.current.has(id),
      );
    if (pending.length === 0) return;
    for (const id of pending) ggufPending.current.add(id);
    void runWithConcurrency(pending, GGUF_LOOKUP_CONCURRENCY, async (id) => {
      try {
        await ensureGGUF(id);
      } finally {
        ggufPending.current.delete(id);
      }
    });
  }, [searchResults, models, ggufCache, ensureGGUF]);

  /** Normalized card model combining installed + search results. */
  const cards = useMemo((): ModelCardData[] => {
    const list: ModelCardData[] = models.map((m) => {
      const meta = downloadedMeta.get(m.name);
      return {
        name: m.name,
        installed: true,
        size: m.size,
        source: m.source,
        precisions: m.precisions,
        downloadedPrecision: meta?.precision ?? undefined,
        contextSize: meta?.context_size ?? undefined,
        paramCount: meta?.param_count ?? undefined,
      };
    });
    if (searchResults.length > 0) {
      const installedNames = new Set(models.map((m) => m.name));
      for (const r of searchResults) {
        if (!installedNames.has(r.id)) {
          list.push({
            name: r.id,
            installed: false,
            downloads: r.downloads,
            likes: r.likes,
            facets: facetSummaryFromModel(r),
            ggufFiles: ggufCache.get(r.id),
            downloaded: downloadedMeta.has(r.id),
          });
        }
      }
    }
    return list;
  }, [models, searchResults, ggufCache, downloadedMeta]);

  /** Family chips for the cards on screen; the active family falls back to All when it disappears. */
  const familyOptions = useMemo(() => familyFilterOptions(cards.map((c) => c.name)), [cards]);
  const activeFamily = familyOptions.some(([id]) => id === family) ? family : FAMILY_ALL;

  /** Cards whose model name contains the search text (case-insensitive) and that match the family. */
  const visibleCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter(
      (m) => (!q || m.name.toLowerCase().includes(q)) && matchesFamily(m.name, activeFamily),
    );
  }, [cards, query, activeFamily]);

  const handleTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    const next = data.value as LibraryTab;
    if (TAB_PATHS[next]) navigate(TAB_PATHS[next]);
  };

  return (
    <div className="local-models-browser-page__page">
      <div className="local-models-browser-page__inner">
        <PageHeader
          eyebrow="● MODEL LIBRARY"
          title="Models"
          subtitle={SUBTITLES[tab]}
          actions={
            tab === "aihub" ? undefined : (
              <Button
                appearance="secondary"
                onClick={() => geniex.cleanModels().catch((err: Error) => setError(String(err)))}
              >
                Clean Cache
              </Button>
            )
          }
        />

        {error && <ErrorBanner message={error} />}

        <TabList selectedValue={tab} onTabSelect={handleTabSelect}>
          <Tab value="local">Local</Tab>
          <Tab value="all">Hugging Face</Tab>
          <Tab value="aihub">Qualcomm AI Hub</Tab>
        </TabList>

        {tab === "aihub" ? (
          <AihubBrowser />
        ) : tab === "local" ? (
          <>
            <div className="local-models-browser-page__toolbar">
              <SearchBox
                className="local-models-browser-page__search"
                placeholder="Filter by model name, or press Search to find on Hugging Face"
                aria-label="Filter models by name"
                value={query}
                onChange={(_, data) => setQuery(data.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
              />
              <Button
                appearance="primary"
                onClick={handleSearch}
                disabled={isSearching || !query.trim()}
                icon={isSearching ? <Spinner size="tiny" /> : undefined}
              >
                Search
              </Button>
            </div>

            {familyOptions.length > 2 && (
              <ChipRow
                options={familyOptions}
                value={activeFamily}
                onChange={setFamily}
                ariaLabel="Model family"
              />
            )}

            {searchResults.length > 0 && (
              <ChipRow
                options={[["clear", "Clear search results"] as const]}
                value=""
                onChange={() => setSearchResults([])}
                ariaLabel="Search results"
              />
            )}

            {activeDownloads.length > 0 && (
              <div className="local-models-browser-page__downloads">
                {activeDownloads.map((d) => (
                  <Card key={d.id} size="small">
                    <CardHeader
                      header={<Body>{d.label}</Body>}
                      description={<Meta>{d.importingProgress ?? d.status}</Meta>}
                    />
                    <ProgressBar
                      aria-label={`Downloading ${d.label}`}
                      value={d.total ? d.received / d.total : undefined}
                    />
                  </Card>
                ))}
              </div>
            )}

            {cards.length === 0 ? (
              <StateBlock icon="📦" message="No models found. Search Hugging Face to pull one." />
            ) : visibleCards.length === 0 ? (
              <StateBlock icon="🔍" message={`No models match "${query.trim()}".`} />
            ) : (
              <div className="local-models-browser-page__grid">
                {visibleCards.map((m) => (
                  <ModelCard
                    key={m.name}
                    model={m}
                    isLoaded={serverStatus.models.some(
                      (lm) => lm === m.name || lm.startsWith(`${m.name}:`),
                    )}
                    isDownloading={activeIds.has(m.name)}
                    onOpenSelector={openSelector}
                    onRemove={setConfirmRemove}
                    isLocal={m.installed}
                    onDetails={(name, isLocal) =>
                      navigate(`/models/${encodeURIComponent(name)}`, {
                        state: { isLocal },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <HubModelBrowser downloading={activeIds} />
        )}

        {confirmRemove && (
          <ConfirmDialog
            title="Remove Model"
            message={
              <>
                Remove <strong>{confirmRemove}</strong> from local storage?
              </>
            }
            confirmLabel="Remove"
            onConfirm={() => handleRemove(confirmRemove)}
            onCancel={() => setConfirmRemove(null)}
          />
        )}
      </div>
    </div>
  );
}
