import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  ChatRegular,
  DeleteRegular,
  FolderOpenRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useCallback, useMemo, useState } from "react";
import { ProgressBar, StateBlock, StatusBadge } from "../components/ui/primitives";
import * as geniex from "../services/geniex";
import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";

type RepoFilter = "all" | "hf" | "aihub";
type Variant = "grid" | "list";

function formatSize(n?: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Full-page model library (list + grid variants). */
export default function ModelLibraryPage() {
  const models = useModelStore((s) => s.models);
  const searchResults = useModelStore((s) => s.searchResults);
  const isSearching = useModelStore((s) => s.isSearching);
  const setSearchResults = useModelStore((s) => s.setSearchResults);
  const setIsSearching = useModelStore((s) => s.setIsSearching);
  const downloads = useModelStore((s) => s.downloads);
  const serverStatus = useModelStore((s) => s.serverStatus);

  const [variant] = useState<Variant>("grid");
  const [query, setQuery] = useState("");
  const [repoFilter, setRepoFilter] = useState<RepoFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

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
  const cards = useMemo(() => {
    type Card = {
      name: string;
      installed: boolean;
      size?: string;
      source?: string;
      precisions?: string[];
      downloads?: number;
      likes?: number;
      pipelineTag?: string;
    };
    const list: Card[] = models.map((m) => ({
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
        <div className="lx-page-headrow">
          <div>
            <span className="lx-page-eyebrow">● MODEL LIBRARY</span>
            <h1 className="lx-page-title">Models</h1>
            <p className="lx-page-subtitle">
              Search, download, and manage local weights from Hugging Face and Qualcomm AI Hub.
            </p>
          </div>
          <div className="lx-page-actions">
            <Button
              appearance="subtle"
              icon={<FolderOpenRegular />}
              onClick={() => geniex.cleanModels().catch((e) => setError(String(e)))}
            >
              Clean Cache
            </Button>
          </div>
        </div>

        {/* ── Hardware banner ──────────────────────── */}
        <div className="lx-hw-banner">
          <span>
            <strong>{serverStatus.running ? "Server Online" : "Server Offline"}</strong>
          </span>
          <span className="lx-titlebar-spacer" />
          <span className="lx-mono">
            {serverStatus.models.length > 0
              ? `${serverStatus.models.length} model(s) loaded on :${serverStatus.port}`
              : `endpoint 127.0.0.1:${serverStatus.port}`}
          </span>
        </div>

        {/* ── Search + filters ─────────────────────── */}
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

        <div className="lx-chiprow" role="tablist" aria-label="Repository filter">
          {(
            [
              ["all", "All Models"],
              ["hf", "Hugging Face"],
              ["aihub", "Qualcomm AI Hub"],
            ] as [RepoFilter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`lx-chip${repoFilter === id ? " active" : ""}`}
              onClick={() => setRepoFilter(id)}
            >
              {label}
            </button>
          ))}
          {searchResults.length > 0 && (
            <button type="button" className="lx-chip" onClick={() => setSearchResults([])}>
              Clear search results
            </button>
          )}
        </div>

        {error && (
          <div className="lx-hw-banner" style={{ borderColor: "var(--lx-error)" }}>
            ⚠ {error}
          </div>
        )}

        {/* ── Active downloads ─────────────────────── */}
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

        {/* ── Model cards ──────────────────────────── */}
        {cards.length === 0 ? (
          <StateBlock icon="📦" message="No models found. Search Hugging Face to pull one." />
        ) : (
          <div
            className={variant === "grid" ? "lx-model-grid" : "lx-model-grid"}
            style={variant === "list" ? { gridTemplateColumns: "1fr" } : undefined}
          >
            {cards.map((m) => {
              const name = m.name;
              const isInstalled = m.installed;
              const isLoaded = serverStatus.models.some(
                (lm) => lm === name || lm.startsWith(`${name}:`),
              );
              const isDownloading = downloads.some((d) => d.model === name);

              return (
                <div key={name} className="lx-model-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <div className="lx-model-card-name">{name}</div>
                    {isLoaded ? (
                      <StatusBadge tone="green">Loaded</StatusBadge>
                    ) : isInstalled ? (
                      <StatusBadge tone="blue">Installed</StatusBadge>
                    ) : (
                      <StatusBadge>Available</StatusBadge>
                    )}
                  </div>

                  {isInstalled ? (
                    <div className="lx-model-card-meta">
                      <span>Size: {m.size ?? "—"}</span>
                      <span>Source: {m.source ?? "—"}</span>
                      {m.precisions && m.precisions.length > 0 && (
                        <span>{m.precisions.join(" / ")}</span>
                      )}
                    </div>
                  ) : (
                    <div className="lx-model-card-meta">
                      <span>⬇ {formatSize(m.downloads)}</span>
                      <span>❤ {formatSize(m.likes)}</span>
                      {m.pipelineTag && <span>{m.pipelineTag}</span>}
                    </div>
                  )}

                  <div className="lx-model-card-actions">
                    {isDownloading ? (
                      <Button size="small" disabled icon={<Spinner size="tiny" />}>
                        Pulling…
                      </Button>
                    ) : isInstalled ? (
                      <>
                        <Button
                          size="small"
                          appearance="primary"
                          icon={<ChatRegular />}
                          onClick={() => startChat(name)}
                          disabled={isLoaded}
                        >
                          {isLoaded ? "Active" : "Load & Chat"}
                        </Button>
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<DeleteRegular />}
                          title="Remove model"
                          onClick={() => setConfirmRemove(name)}
                        />
                      </>
                    ) : (
                      <Button
                        size="small"
                        appearance="primary"
                        icon={<ArrowDownloadRegular />}
                        onClick={() => handlePull(name)}
                      >
                        Download
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Remove confirmation ──────────────────── */}
        {confirmRemove && (
          <div
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              className="lx-card"
              role="dialog"
              aria-modal="true"
              aria-label="Remove model"
              style={{ minWidth: 320 }}
            >
              <div className="lx-card-title" style={{ marginBottom: 8 }}>
                Remove Model
              </div>
              <p style={{ fontSize: 13.5, marginBottom: 16 }}>
                Remove <strong>{confirmRemove}</strong> from local storage?
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Button appearance="secondary" onClick={() => setConfirmRemove(null)}>
                  Cancel
                </Button>
                <Button appearance="primary" onClick={() => handleRemove(confirmRemove)}>
                  Remove
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
