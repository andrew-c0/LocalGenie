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
import { useModelStore } from "../../stores/modelStore";
import type { ModelInfo } from "../../types";
import { shortName } from "../../utils/format";

interface ModelSelectorPopoverProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Stitch-style active model dropdown: searchable list of installed models
 * split into loaded/active and ready-to-load, with quick actions.
 */
export default function ModelSelectorPopover({ open, onClose }: ModelSelectorPopoverProps) {
  const navigate = useNavigate();
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const serverPort = useModelStore((s) => s.serverPort);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const activeModelId = useModelStore((s) => s.activeModelId);
  const setActiveModel = useModelStore((s) => s.setActiveModel);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      if (!serverStatus.running) {
        const started = await geniex.startServer({ port: serverPort });
        setServerStatus(started);
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

      <div className="lx-popover-body">
        {loadedModels.length > 0 && (
          <>
            <div className="lx-popover-section">
              <span>Loaded & Active</span>
              <span className="lx-popover-section-status">
                <span className="lx-popover-pulse" />
                {serverStatus.running ? "Hexagon NPU" : "Server"}
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
