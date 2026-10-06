import { Button, Spinner } from "@fluentui/react-components";
import { FolderOpenRegular, SearchRegular } from "@fluentui/react-icons";
import { useCallback, useMemo, useState } from "react";
import HubBrowse from "../components/models/HubBrowse";
import { ChipRow } from "../components/ui/ChipRow/ChipRow";
import { ConfirmDialog } from "../components/ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../components/ui/ErrorBanner/ErrorBanner";
import { ModelCard, type ModelCardData } from "../components/ui/ModelCard/ModelCard";
import { PageHeader } from "../components/ui/PageHeader/PageHeader";
import { ProgressBar, StateBlock } from "../components/ui/primitives";
import * as geniex from "../services/geniex";
import { useChatStore } from "../stores/chatStore";
import { type ModelTab, useHubBrowseStore } from "../stores/hubBrowseStore";
import { useModelStore } from "../stores/modelStore";

type RepoFilter = "all" | "hf" | "aihub";

const SOURCE_TABS: [ModelTab, string][] = [
  ["local", "Local Models"],
  ["qualcomm", "Qualcomm AI Hub"],
  ["all", "All Hugging Face"],
];

const REPO_FILTERS: [RepoFilter, string][] = [
  ["all", "All Models"],
  ["hf", "Hugging Face"],
  ["aihub", "Qualcomm AI Hub"],
];

/** Full-page model library (list + grid variants). */
export default function ModelLibraryPage() {
  const models = useModelStore((s) => s.models);
  const searchResults = useModelStore((s) => s.searchResults);
  const isSearching = useModelStore((s) => s.isSearching);
  const setSearchResults = useModelStore((s) => s.setSearchResults);
  const setIsSearching = useModelStore((s) => s.setIsSearching);
  const downloads = useModelStore((s) => s.downloads);
  const serverStatus = useModelStore((s) => s.serverStatus);

  const tab = useHubBrowseStore((s) => s.activeTab);
  const setTab = useHubBrowseStore((s) => s.setActiveTab);
  const [query, setQuery] = useState("");
  const [repoFilter, setRepoFilter] = useState<RepoFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [hubDownloading, setHubDownloading] = useState<Set<string>>(new Set());

  const handleHubDownload = useCallback((repoId: string) => {
    setHubDownloading((prev) => new Set(prev).add(repoId));
    geniex
      .pullModel(repoId)
      .catch((err) => setError(`Pull failed: ${err}`))
      .finally(() =>
        setHubDownloading((prev) => {
          const next = new Set(prev);
          next.delete(repoId);
          return next;
        }),
      );
  }, []);

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

  const handlePull = useCallback((model: string) => {
    setError(null);
    geniex.pullModel(model).catch((err) => setError(`Pull failed: ${err}`));
  }, []);

  const handleRemove = useCallback(async (model: string) => {
    setError(null);
    try {
      await geniex.removeModel(model);
      const updated = await geniex.listModels();
      useModelStore.getState().setModels(updated);
    } catch (err) {
      setError(String(err));
    } finally {
      setConfirmRemove(null);
    }
  }, []);

  const startChat = useCallback(async (modelName: string) => {
    try {
      await geniex.loadModel(modelName);
      useModelStore.getState().setActiveModel(modelName);
      const activeId = useChatStore.getState().activeSessionId;
      if (activeId) useChatStore.getState().setSessionModel(activeId, modelName);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  /** Normalized card model combining installed + search results. */
  const cards = useMemo((): ModelCardData[] => {
    const list: ModelCardData[] = models.map((m) => ({
      name: m.name,
      installed: true,
      size: m.size,
      source: m.source,
      precisions: m.precisions,
    }));
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
          });
        }
      }
    }
    return list.filter((m) => {
      if (repoFilter === "hf") return !m.name.includes("qualcomm");
      if (repoFilter === "aihub") return m.name.includes("qualcomm");
      return true;
    });
  }, [models, searchResults, repoFilter]);

  return (
    <div className="lx-page">
      <div className="lx-page-inner">
        <PageHeader
          eyebrow="● MODEL LIBRARY"
          title="Models"
          subtitle="Search, download, and manage local weights from Hugging Face and Qualcomm AI Hub."
          actions={
            <Button
              appearance="subtle"
              icon={<FolderOpenRegular />}
              onClick={() => geniex.cleanModels().catch((e) => setError(String(e)))}
            >
              Clean Cache
            </Button>
          }
        />

        {/* -- Top tabs -- */}
        <ChipRow options={SOURCE_TABS} value={tab} onChange={setTab} ariaLabel="Model source" />

        {error && <ErrorBanner message={error} />}

        {/* -- Hub browse tabs -- */}
        {tab !== "local" && (
          <HubBrowse area={tab} onDownload={handleHubDownload} downloading={hubDownloading} />
        )}

        {/* -- Local models tab -- */}
        {tab === "local" && (
          <>
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

            <ChipRow
              options={REPO_FILTERS}
              value={repoFilter}
              onChange={setRepoFilter}
              ariaLabel="Repository filter"
            >
              {searchResults.length > 0 && (
                <button type="button" className="lx-chip" onClick={() => setSearchResults([])}>
                  Clear search results
                </button>
              )}
            </ChipRow>

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
                    onLoad={startChat}
                    onDownload={handlePull}
                    onRemove={setConfirmRemove}
                  />
                ))}
              </div>
            )}
          </>
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
