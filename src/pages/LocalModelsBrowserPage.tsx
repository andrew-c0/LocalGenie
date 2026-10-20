import { Button, Spinner } from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import HubModelBrowser from "../components/models/HubModelBrowser";
import { ChipRow } from "../components/ui/ChipRow/ChipRow";
import { ConfirmDialog } from "../components/ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../components/ui/ErrorBanner/ErrorBanner";
import {
  type GGUFFileOption,
  ModelCard,
  type ModelCardData,
} from "../components/ui/ModelCard/ModelCard";
import { PageHeader } from "../components/ui/PageHeader/PageHeader";
import { ProgressBar, StateBlock } from "../components/ui/primitives";
import * as db from "../services/database";
import * as geniex from "../services/geniex";
import * as hub from "../services/hubModels";
import { useHubBrowseStore } from "../stores/hubBrowseStore";
import { useModelStore } from "../stores/modelStore";

/** Browser page for locally installed models (list + grid variants). */
export default function LocalModelsBrowserPage() {
  const models = useModelStore((s) => s.models);
  const searchResults = useModelStore((s) => s.searchResults);
  const isSearching = useModelStore((s) => s.isSearching);
  const setSearchResults = useModelStore((s) => s.setSearchResults);
  const setIsSearching = useModelStore((s) => s.setIsSearching);
  const downloads = useModelStore((s) => s.downloads);
  const serverStatus = useModelStore((s) => s.serverStatus);

  const activeTab = useHubBrowseStore((s) => s.activeTab);
  const setActiveTab = useHubBrowseStore((s) => s.setActiveTab);

  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [downloadedMeta, setDownloadedMeta] = useState<Map<string, db.DbDownloadedModel>>(
    new Map(),
  );

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
  const [ggufCache, setGgufCache] = useState<Map<string, GGUFFileOption[]>>(new Map());
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
          version: f.version,
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
    } finally {
      setConfirmRemove(null);
    }
  }, []);

  const openSelector = useCallback(() => {
    setSelectorOpen(true);
  }, [setSelectorOpen]);

  // When search results appear, fetch the GGUF file list for each so the
  // cards can show the variant picker. Best-effort — failures just leave the
  // card with the generic "Download" button.
  useEffect(() => {
    if (searchResults.length === 0) return;
    const installedNames = new Set(models.map((m) => m.name));
    for (const r of searchResults) {
      if (installedNames.has(r.id)) continue;
      if (ggufCache.has(r.id)) continue;
      void ensureGGUF(r.id);
    }
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
            pipelineTag: r.pipeline_tag,
            ggufFiles: ggufCache.get(r.id),
          });
        }
      }
    }
    return list;
  }, [models, searchResults, ggufCache, downloadedMeta]);

  return (
    <div className="lx-page">
      <div className="lx-page-inner">
        <PageHeader
          eyebrow="● MODEL LIBRARY"
          title="Models"
          subtitle="Search, download, and manage local weights from Hugging Face and Qualcomm AI Hub."
          actions={
            <Button
              appearance="secondary"
              onClick={() => geniex.cleanModels().catch((err: Error) => setError(String(err)))}
            >
              Clean Cache
            </Button>
          }
        />

        {error && <ErrorBanner message={error} />}

        {/* Tab selector: Local vs. Hugging Face (all) */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            style={{
              flex: 1,
              padding: 6,
              border:
                activeTab === "local"
                  ? "1px solid var(--lx-text-accent)"
                  : "1px solid var(--lx-border)",
              borderRadius: 4,
              background: activeTab === "local" ? "var(--lx-bg-subtle)" : "transparent",
              color: activeTab === "local" ? "var(--lx-text)" : "var(--lx-text-muted)",
              cursor: "pointer",
              fontWeight: activeTab === "local" ? "500" : "400",
            }}
            onClick={() => setActiveTab("local")}
          >
            Local
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: 6,
              border:
                activeTab === "all"
                  ? "1px solid var(--lx-text-accent)"
                  : "1px solid var(--lx-border)",
              borderRadius: 4,
              background: activeTab === "all" ? "var(--lx-bg-subtle)" : "transparent",
              color: activeTab === "all" ? "var(--lx-text)" : "var(--lx-text-muted)",
              cursor: "pointer",
              fontWeight: activeTab === "all" ? "500" : "400",
            }}
            onClick={() => setActiveTab("all")}
          >
            Hugging Face
          </button>
        </div>

        {activeTab === "local" ? (
          <div>
            <div className="lx-model-toolbar">
              <div className="lx-search">
                <SearchRegular style={{ color: "var(--lx-text-muted)" }} />
                <input
                  placeholder="Search models, quantized weights, architectures…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                  aria-label="Search models"
                />
                <Button
                  size="small"
                  appearance="primary"
                  onClick={handleSearch}
                  disabled={isSearching || !query.trim()}
                >
                  {isSearching ? <Spinner size="tiny" /> : "Search"}
                </Button>
              </div>
            </div>

            {searchResults.length > 0 && (
              <ChipRow
                options={[["clear", "Clear search results"] as const]}
                value=""
                onChange={() => setSearchResults([])}
                ariaLabel="Search results"
              />
            )}

            {/* -- Active downloads -- */}
            {downloads.map((d) => (
              <div
                key={d.model}
                className="lx-card"
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span className="lx-mono">{d.model}</span>
                  <span style={{ color: "var(--lx-text-muted)" }}>{d.message}</span>
                </div>
                <ProgressBar value={60} />
              </div>
            ))}

            {/* -- Model cards -- */}
            {cards.length === 0 ? (
              <StateBlock icon="📦" message="No models found. Search Hugging Face to pull one." />
            ) : (
              <div className="lx-model-grid">
                {cards.map((m) => (
                  <ModelCard
                    key={m.name}
                    model={m}
                    isLoaded={serverStatus.models.some(
                      (lm) => lm === m.name || lm.startsWith(`${m.name}:`),
                    )}
                    isDownloading={downloads.some((d) => d.model === m.name)}
                    onOpenSelector={openSelector}
                    onRemove={setConfirmRemove}
                    isLocal={m.installed}
                    onDetails={(name, isLocal) =>
                      navigate("/models/" + encodeURIComponent(name), {
                        state: { isLocal },
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <HubModelBrowser area="all" downloading={new Set(downloads.map((d) => d.model))} />
        )}

        {/* -- Remove confirmation -- */}
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
