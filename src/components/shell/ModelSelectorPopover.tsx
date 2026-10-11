import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowRightRegular,
  ArrowUploadRegular,
  CheckmarkRegular,
  DismissRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as geniex from "../../services/geniex";
import { useChatStore } from "../../stores/chatStore";
import {
  COMPUTE_TARGETS,
  type ComputeChoice,
  DEFAULT_COMPUTE,
  useModelStore,
} from "../../stores/modelStore";
import type { ModelInfo } from "../../types";
import { shortName } from "../../utils/format";

interface ModelSelectorPopoverProps {
  open: boolean;
  onClose: () => void;
  /** Callback when the popover is opened — used by the model library to open it. */
  onOpenChange?: (open: boolean) => void;
}

/** Short label + description for each compute target. */
const COMPUTE_META: Record<ComputeChoice, { label: string; hint: string }> = {
  npu: { label: "NPU", hint: "Hexagon HTP — fastest, most efficient" },
  gpu: { label: "GPU", hint: "Adreno OpenCL path" },
  cpu: { label: "CPU", hint: "Baseline; slowest but always available" },
};

/**
 * Stitch-style active model dropdown: searchable list of installed models
 * split into loaded/active and ready-to-load, with quick actions.
 */
export default function ModelSelectorPopover({ open, onClose, onOpenChange }: ModelSelectorPopoverProps) {
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const serverPort = useModelStore((s) => s.serverPort);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const compute = useModelStore((s) => s.compute);
  const setCompute = useModelStore((s) => s.setCompute);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Compute target the running server was started with (null = unknown/external). */
  const activeComputeRef = useRef<ComputeChoice | null>(
    serverStatus.running ? DEFAULT_COMPUTE : null,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setError(null);
      inputRef.current?.focus();
    }
  }, [open]);

  // Close on Escape / outside click
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  // Notify parent when open state changes
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const { loadedModels, readyModels } = useMemo(() => {
    const loadedNames = new Set(serverStatus.models.map((m) => m.split(":")[0]));
    const loaded: ModelInfo[] = [];
    const ready: ModelInfo[] = [];
    for (const m of models) {
      const base = m.name.split("/").pop() ?? m.name;
      const q = query.trim().toLowerCase();
      if (q && !base.toLowerCase().includes(q)) continue;
      if (loadedNames.has(base)) loaded.push(m);
      else ready.push(m);
    }
    return { loadedModels: loaded, readyModels: ready };
  }, [models, serverStatus.models, query]);

  if (!open) return null;

  /** Load a model and set it active; also binds it to the open chat session. */
  const handleSelect = async (name: string) => {
    const base = name.split("/").pop() ?? name;
    if (serverStatus.models.some((lm) => lm === base || lm.startsWith(`${base}:`))) {
      setActiveModel(name);
      onClose();
      return;
    }
    setLoading(name);
    setError(null);
    try {
      // Ensure the GenieX server is running before attempting to load.
      // Start/restart it with the selected compute target — a server spawned
      // with a different compute must be restarted for the flag to apply.
      const needsRestart = serverStatus.running && compute !== activeComputeRef.current;
      if (needsRestart) {
        await geniex.stopServer(serverPort);
      }
      if (needsRestart || !serverStatus.running) {
        const started = await geniex.startServer({ port: serverPort, compute });
        setServerStatus(started);
        activeComputeRef.current = compute;
      }
      // load_model returns the refreshed server status (with the new model listed).
      const status = await geniex.loadModel(name);
      setServerStatus(status);
      setActiveModel(name);
      const activeId = useChatStore.getState().activeSessionId;
      if (activeId) useChatStore.getState().setSessionModel(activeId, name);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  };

  /** Switch the compute target; restarts the server when it is running. */
  const handleComputeChange = async (next: ComputeChoice) => {
    const prev = compute;
    setCompute(next);
    if (!serverStatus.running || next === prev) return;
    setLoading("__compute__");
    setError(null);
    try {
      await geniex.stopServer(serverPort);
      activeComputeRef.current = null;
      const started = await geniex.startServer({ port: serverPort, compute: next });
      setServerStatus(started);
      activeComputeRef.current = next;
    } catch (err) {
      setCompute(prev);
      setError(String(err));
    } finally {
      setLoading(null);
    }
  };

  /** Unload all models from the server (stops the server, the only unload mechanism). */
  const handleUnload = async () => {
    setLoading("__unload__");
    setError(null);
    try {
      const status = await geniex.unloadAllModels();
      setServerStatus(status);
      setActiveModel(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(null);
    }
  };

  const renderOption = (m: ModelInfo) => {
    const base = m.name.split("/").pop() ?? m.name;
    const isActive = activeModelId === m.name;
    const loadedHere = serverStatus.models.some((lm) => lm === base || lm.startsWith(`${base}:`));
    const precision = m.precisions.length > 0 ? m.precisions[0] : null;

    return (
      <button
        key={m.name}
        type="button"
        className={`lx-popover-option${isActive ? " active" : ""}`}
        onClick={() => handleSelect(m.name)}
        disabled={loading !== null}
      >
        <span className={`lx-popover-dot${loadedHere ? " on" : ""}`} />
        <span className="lx-popover-option-main">
          <span className="lx-popover-option-name">
            {shortName(m.name)}
            {precision && <span className="lx-popover-quant">{precision}</span>}
          </span>
          <span className="lx-popover-option-sub">
            {loadedHere ? "Loaded on server" : "Ready to load"} • {m.size}
          </span>
        </span>
        {loading === m.name ? (
          <Spinner size="tiny" />
        ) : isActive ? (
          <>
            <span className="lx-popover-tps">Active</span>
            <CheckmarkRegular style={{ color: "var(--lx-primary)", fontSize: 18 }} />
          </>
        ) : (
          <span className="lx-popover-switch">Switch</span>
        )}
      </button>
    );
  };

  return (
    <div ref={panelRef} className="lx-popover" role="dialog" aria-label="Switch active model">
      <div className="lx-popover-search">
        <SearchRegular style={{ color: "var(--lx-text-muted)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          placeholder="Filter installed models..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter installed models"
        />
        <span className="lx-popover-kbd">Ctrl+K</span>
        <Button
          appearance="transparent"
          size="small"
          icon={<DismissRegular />}
          onClick={onClose}
          title="Close"
        />
      </div>

      {error && <div className="lx-popover-error">⚠ {error}</div>}

      {/* ── Compute target selector ───────────────── */}
      <div className="lx-compute-row">
        <span className="lx-compute-row-label">Run on</span>
        <div className="lx-compute-row-options">
          {COMPUTE_TARGETS.map((t) => (
            <label
              key={t}
              className={`lx-compute-pill${compute === t ? " selected" : ""}`}
              title={COMPUTE_META[t].hint}
            >
              <input
                type="radio"
                name="compute-target"
                value={t}
                checked={compute === t}
                disabled={loading !== null}
                onChange={() => handleComputeChange(t)}
                aria-label={`Run models on ${COMPUTE_META[t].label} — ${COMPUTE_META[t].hint}`}
                className="lx-compute-input"
              />
              {loading === "__compute__" && compute === t ? (
                <Spinner size="tiny" />
              ) : (
                COMPUTE_META[t].label
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="lx-popover-body">
        {loadedModels.length > 0 && (
          <>
            <div className="lx-popover-section">
              <span>Loaded & Active</span>
              <span className="lx-popover-section-status">
                <span className="lx-popover-pulse" />
                {serverStatus.running ? `Compute: ${COMPUTE_META[compute].label}` : "Server"}
              </span>
            </div>
            {loadedModels.map(renderOption)}
          </>
        )}

        {readyModels.length > 0 && (
          <>
            <div className="lx-popover-section">
              <span>Installed & Ready to Load</span>
              <span className="lx-popover-section-count">{readyModels.length} available</span>
            </div>
            {readyModels.map(renderOption)}
          </>
        )}

        {loadedModels.length === 0 && readyModels.length === 0 && (
          <div className="lx-empty" style={{ padding: 24 }}>
            {query ? `No models match "${query}".` : "No models installed yet."}
          </div>
        )}
      </div>

      <div className="lx-popover-divider" />

      <div className="lx-popover-footer">
        {serverStatus.running && serverStatus.models.length > 0 && (
          <button
            type="button"
            className="lx-popover-link muted"
            title="unload"
            disabled={loading !== null}
            onClick={() => handleUnload()}
          >
            {loading === "__unload__" ? <Spinner size="tiny" /> : <ArrowUploadRegular />}
            <span>Unload</span>
          </button>
        )}
        <button
          type="button"
          className="lx-popover-link"
          onClick={() => {
            onClose();
            navigate("/models");
          }}
        >
          <ArrowRightRegular />
          <span>Browse Model Hub...</span>
        </button>
        <button
          type="button"
          className="lx-popover-link muted"
          onClick={() => {
            onClose();
            navigate("/settings");
          }}
        >
          <span>Manage Weights & Storage</span>
        </button>
      </div>
    </div>
  );
}
