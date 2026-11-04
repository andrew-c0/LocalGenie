import {
  Button,
  Card,
  CardHeader,
  ProgressBar,
  SearchBox,
  Spinner,
} from "@fluentui/react-components";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LocalModelCard } from "../../components/models/LocalModelCard";
import { ChipRow } from "../../components/ui/ChipRow/ChipRow";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../../components/ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../components/ui/Flex/Flex";
import { ModelCard } from "../../components/ui/ModelCard/ModelCard";
import { hubCardData } from "../../components/ui/ModelCard/modelCardData";
import { PageHeader } from "../../components/ui/PageHeader/PageHeader";
import { RetryBlock } from "../../components/ui/RetryBlock/RetryBlock";
import { SkeletonRows } from "../../components/ui/Skeletons/SkeletonRows";
import { StateBlock } from "../../components/ui/StateBlock/StateBlock";
import { useSystemMemory } from "../../hooks/useSystemMemory";
import * as db from "../../services/database";
import * as geniex from "../../services/geniex";
import { isDownloadActive, useDownloadStore } from "../../stores/downloadStore";
import { useModelStore } from "../../stores/modelStore";
import { FAMILY_ALL, familyFilterOptions, matchesFamily } from "../../utils/modelFamily";
import { toast } from "../../utils/toast";
import "./LocalModelsBrowserPage.css";
import { Body, Meta } from "../../components/ui/Typography/Typography";

const SUBTITLE = "Models installed on this device, ready to load into the GenieX server.";

/**
 * Installed models (`/models/local`): the local library with a name filter, family chips and
 * Hugging Face search results. Each card opens its own detail page.
 */
export default function LocalModelsBrowserPage() {
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
  // Read once for every result card on this page; each card's RAM verdict is derived from it.
  const systemMemory = useSystemMemory();

  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState(FAMILY_ALL);
  const [error, setError] = useState<string | null>(null);
  /** Why the Hugging Face search failed. Shown as a retry under the list, not as the banner. */
  const [searchError, setSearchError] = useState<string | null>(null);
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
    setSearchError(null);
    try {
      const results = await geniex.searchModels(query);
      setSearchResults(results);
    } catch (err) {
      setSearchError(String(err));
    } finally {
      setIsSearching(false);
    }
  }, [query, setIsSearching, setSearchResults]);

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

  const openInstalledDetails = useCallback(
    (name: string) => navigate(`/models/local/${encodeURIComponent(name)}`),
    [navigate],
  );

  const openHubDetails = useCallback(
    (name: string) => navigate(`/models/huggingface/${encodeURIComponent(name)}`),
    [navigate],
  );

  /** Search results that are not installed; an installed model is listed from the store instead. */
  const remoteResults = useMemo(() => {
    const installedNames = new Set(models.map((m) => m.name));
    return searchResults.filter((r) => !installedNames.has(r.id));
  }, [models, searchResults]);

  /** Family chips for the cards on screen; the active family falls back to All when it disappears. */
  const familyOptions = useMemo(
    () => familyFilterOptions([...models.map((m) => m.name), ...remoteResults.map((r) => r.id)]),
    [models, remoteResults],
  );
  const activeFamily = familyOptions.some(([id]) => id === family) ? family : FAMILY_ALL;

  /** Cards whose model name contains the search text (case-insensitive) and that match the family. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (name: string) =>
      (!q || name.toLowerCase().includes(q)) && matchesFamily(name, activeFamily);
    return {
      installed: models.filter((m) => matches(m.name)),
      remote: remoteResults.filter((r) => matches(r.id)),
    };
  }, [models, remoteResults, query, activeFamily]);
  /** Whether any card is shown. With none, the list shows a search in progress, its retry, or a text. */
  const hasRows = visible.installed.length + visible.remote.length > 0;
  const noRowsState =
    models.length + remoteResults.length === 0 ? (
      <StateBlock icon="📦" message="No models found. Search Hugging Face to pull one." />
    ) : (
      <StateBlock icon="🔍" message={`No models match "${query.trim()}".`} />
    );

  return (
    <div className="local-models-browser-page__page">
      <div className="local-models-browser-page__inner">
        <PageHeader
          title="Installed models"
          subtitle={SUBTITLE}
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

        {hasRows || isSearching || searchError ? (
          <Flex direction="column" gap="s">
            {visible.installed.map((m) => (
              <LocalModelCard
                key={m.name}
                model={m}
                stored={downloadedMeta.get(m.name)}
                isLoaded={serverStatus.models.some(
                  (lm) => lm === m.name || lm.startsWith(`${m.name}:`),
                )}
                isDownloading={activeIds.has(m.name)}
                onOpenSelector={openSelector}
                onRemove={setConfirmRemove}
                onDetails={openInstalledDetails}
              />
            ))}
            {visible.remote.map((r) => (
              <ModelCard
                key={r.id}
                model={hubCardData(r, systemMemory, downloadedMeta.has(r.id))}
                isLoaded={false}
                isDownloading={activeIds.has(r.id)}
                onDetails={openHubDetails}
              />
            ))}
            {searchError && (
              <RetryBlock
                compact
                error={searchError}
                subject="Hugging Face"
                onRetry={() => void handleSearch()}
              />
            )}
            {isSearching && <SkeletonRows count={3} variant="card" />}
          </Flex>
        ) : (
          noRowsState
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
