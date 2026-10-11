import { type ReactNode, useEffect, useRef } from "react";
import { useDebouncedCallback, useTauriEvent } from "../hooks";
import * as db from "../services/database";
import * as geniex from "../services/geniex";
import { useChatStore } from "../stores/chatStore";
import { useDownloadStore } from "../stores/downloadStore";
import { useModelStore } from "../stores/modelStore";
import type { DownloadedModelMeta, Message } from "../types";

/**
 * Global app bootstrap: initial data load (CLI check, sessions, models,
 * server status), Tauri event listeners (chat streaming, pull progress,
 * server crashes) and debounced session persistence. Renders children once
 * mounted — `App.tsx` stays pure scaffolding.
 */
export default function AppBootstrap({ children }: { children: ReactNode }) {
  const loadSessions = useChatStore((s) => s.loadSessions);
  const updateLastAssistantMessage = useChatStore((s) => s.updateLastAssistantMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const lastSendTime = useChatStore((s) => s.lastSendTime);

  const setModels = useModelStore((s) => s.setModels);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setServerPort = useModelStore((s) => s.setServerPort);
  const setCliInstalled = useModelStore((s) => s.setCliInstalled);
  const setUpdateInfo = useModelStore((s) => s.setUpdateInfo);

  // Track token count for stats
  const tokenCountRef = useRef(0);
  const firstTokenTimeRef = useRef(0);

  // ── Initialise: check CLI, load sessions & models ────────────
  useEffect(() => {
    (async () => {
      try {
        const installed = await geniex.checkGeniexInstalled();
        setCliInstalled(installed);

        // Check for CLI updates once we know the CLI is installed.
        if (installed) {
          try {
            const info = await geniex.checkForCliUpdate();
            setUpdateInfo(info);
          } catch {
            // Network error or parse failure — silently ignore.
          }
        }
      } catch {
        setCliInstalled(false);
      }
      try {
        const saved = await db.loadSessions();
        console.log(`[init] Loaded ${saved.length} sessions from DB`);
        loadSessions(saved);
      } catch (err) {
        console.error("[init] Failed to load sessions:", err);
      }
      try {
        const models = await geniex.listModels();
        setModels(models);
      } catch {
        // GenieX CLI may not be installed
      }
      // Load port preference before probing server status
      try {
        const port = await db.getPreference<number>("server_port");
        if (port && port > 0) setServerPort(port);
      } catch {
        // use default
      }
      try {
        const currentPort = useModelStore.getState().serverPort;
        const status = await geniex.getServerStatus(currentPort);
        setServerStatus(status);
      } catch {
        // ignore
      }
    })();
  }, [loadSessions, setModels, setUpdateInfo, setServerStatus, setCliInstalled, setServerPort]);

  // ── Listen for server crash (process exited unexpectedly) ──────
  useTauriEvent("server-stopped", () => {
    console.warn("[app] Server process exited unexpectedly");
    setServerStatus({ running: false, port: useModelStore.getState().serverPort, models: [] });
  });

  // ── Persist active session to DB (debounced) ──────────────────
  const persistSession = useDebouncedCallback(() => {
    const { sessions: currentSessions, activeSessionId: activeId } = useChatStore.getState();
    if (!activeId) return;
    const session = currentSessions.find((s) => s.id === activeId);
    if (session) {
      db.saveSession(session).catch(() => {});
    }
  }, 500);

  useEffect(() => {
    persistSession();
  }, [persistSession]);

  // ── Listen for streaming chat chunks from Rust backend ────────
  useTauriEvent<{ content: string }>("chat-chunk", (payload) => {
    const activeId = useChatStore.getState().activeSessionId;
    if (!activeId) return;
    const store = useChatStore.getState();
    const session = store.sessions.find((s) => s.id === activeId);
    if (!session) return;

    tokenCountRef.current += 1;

    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      // Append to existing assistant message
      updateLastAssistantMessage(activeId, lastMsg.content + payload.content);
    } else {
      // First chunk of a new response — reset per-response counters
      tokenCountRef.current = 1;
      firstTokenTimeRef.current = Date.now();
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: payload.content,
        timestamp: Date.now(),
        modelId: session.modelId ?? undefined,
      };
      store.addMessage(activeId, assistantMsg);
      // Persist immediately so the message survives app restarts mid-stream
      db.saveMessage(activeId, assistantMsg).catch(() => {});
    }
  });

  useTauriEvent("chat-done", () => {
    setStreaming(false);

    const activeId = useChatStore.getState().activeSessionId;
    if (!activeId) return;
    const store = useChatStore.getState();
    const session = store.sessions.find((s) => s.id === activeId);
    if (!session) return;

    const lastMsg = session.messages[session.messages.length - 1];
    if (!lastMsg) return;

    // Compute generation stats
    const totalTime = Date.now() - lastSendTime;
    const timeToFirstToken = firstTokenTimeRef.current
      ? firstTokenTimeRef.current - lastSendTime
      : totalTime;
    firstTokenTimeRef.current = 0;
    const tokenCount = tokenCountRef.current;
    tokenCountRef.current = 0;

    // Find the user message that triggered this response
    let promptChars = 0;
    for (let i = session.messages.length - 2; i >= 0; i--) {
      if (session.messages[i].role === "user") {
        promptChars = session.messages[i].content.length;
        break;
      }
    }

    if (lastMsg.role === "assistant" && lastMsg.content) {
      store.updateMessageStats(activeId, lastMsg.id, {
        timeToFirstToken,
        totalTime,
        tokenCount,
        promptChars,
      });
      db.saveMessage(activeId, lastMsg).catch(() => {});
    }
  });

  // ── Listen for pull progress ──────────────────────────────────
  useTauriEvent<{ model: string }>("model-pull-start", (payload) => {
    // Register CLI pulls in the downloads drawer as soon as they start.
    useDownloadStore.getState().upsert({ id: payload.model, label: payload.model });
  });

  useTauriEvent<{ model: string; message: string }>("model-pull-progress", (payload) => {
    useModelStore.getState().addDownload({
      model: payload.model,
      message: payload.message,
      status: "downloading",
    });
  });

  useTauriEvent<{ model: string }>("model-pull-complete", async (payload) => {
    useModelStore.getState().removeDownload(payload.model);
    useDownloadStore.getState().setStatus(payload.model, "complete");
    // Refresh model list
    try {
      const models = await geniex.listModels();
      useModelStore.getState().setModels(models);
    } catch {
      // ignore
    }
    // Persist downloaded-model metadata (precision + context size) so the
    // model card can show real values instead of defaults. Best-effort.
    try {
      const meta = await fetchDownloadedModelMeta(payload.model);
      await db.upsertDownloadedModel(
        payload.model,
        meta.precision ?? null,
        meta.contextSize ?? null,
        meta.paramCount ?? null,
      );
    } catch {
      // ignore — metadata is a nice-to-have
    }
  });

  // ── Listen for asset download progress (drawer) ──────────────
  useTauriEvent<{
    file: string;
    received?: number;
    total?: number | null;
    speed?: number;
    complete?: boolean;
    cancelled?: boolean;
  }>("asset-download-progress", (payload) => {
    const store = useDownloadStore.getState();
    if (payload.cancelled) {
      store.setStatus(payload.file, "cancelled");
      return;
    }
    if (payload.complete) {
      store.setStatus(payload.file, "complete");
      return;
    }
    store.patchProgress(
      payload.file,
      payload.received ?? 0,
      payload.total ?? null,
      payload.speed ?? 0,
    );
  });

  return <>{children}</>;
}

/**
 * Fetch downloaded-model metadata from the local DB, falling back to the HF
 * config.json (real context size) and safetensors metadata (param count) when
 * the DB has nothing yet.
 */
export async function fetchDownloadedModelMeta(repoId: string): Promise<DownloadedModelMeta> {
  const rows = await db.listDownloadedModels();
  const row = rows.find((r) => r.name === repoId);
  if (row) {
    return {
      precision: row.precision ?? undefined,
      contextSize: row.context_size ?? undefined,
      paramCount: row.param_count ?? undefined,
    };
  }

  // Fallback: read config.json from the HF repo to get the real context size.
  try {
    const res = await fetch(`https://huggingface.co/${repoId}/resolve/main/config.json`, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const cfg = await res.json();
      const ctx =
        cfg.context_length ??
        cfg.max_position_embeddings ??
        cfg.max_sequence_length ??
        cfg.model_type === "llama"
          ? cfg.max_position_embeddings
          : undefined;
      return { contextSize: ctx };
    }
  } catch {
    // ignore
  }
  return {};
}
