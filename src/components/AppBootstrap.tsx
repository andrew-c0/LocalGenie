import { type ReactNode, useEffect, useRef } from "react";
import { useTauriEvent } from "../hooks";
import * as db from "../services/database";
import * as geniex from "../services/geniex";
import { fetchContextLength } from "../services/hubApi";
import { useChatStore } from "../stores/chatStore";
import { useDownloadStore } from "../stores/downloadStore";
import { useModelStore } from "../stores/modelStore";
import type { DownloadedModelMeta, GenerationStats, Message } from "../types";

/** Delay before sessions that changed are written to the DB. */
const SESSION_SAVE_DELAY_MS = 500;

/**
 * Global app bootstrap: initial data load (CLI check, sessions, models, server
 * status), Tauri event listeners (chat streaming, download and import progress,
 * server crashes) and debounced session persistence. Renders children once
 * mounted — `App.tsx` stays pure scaffolding.
 */
export default function AppBootstrap({ children }: { children: ReactNode }) {
  const loadSessions = useChatStore((s) => s.loadSessions);
  const updateLastAssistantMessage = useChatStore((s) => s.updateLastAssistantMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const setActiveStream = useChatStore((s) => s.setActiveStream);
  const lastSendTime = useChatStore((s) => s.lastSendTime);

  const setModels = useModelStore((s) => s.setModels);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setServerPort = useModelStore((s) => s.setServerPort);
  const setCliInstalled = useModelStore((s) => s.setCliInstalled);
  const setUpdateInfo = useModelStore((s) => s.setUpdateInfo);

  // Track token count for stats
  const tokenCountRef = useRef(0);
  const firstTokenTimeRef = useRef(0);

  // ── Initialise: load everything independent of each other in parallel ──
  useEffect(() => {
    (async () => {
      const [installed, saved, models, port] = await Promise.all([
        geniex.checkGeniexInstalled().catch(() => false),
        db.loadSessions().catch((err) => {
          console.error("[init] Failed to load sessions:", err);
          return null;
        }),
        geniex.listModels().catch(() => null), // CLI may not be installed
        db.getPreference<number>("server_port").catch(() => null),
      ]);

      setCliInstalled(installed);
      if (saved) loadSessions(saved);
      if (models) setModels(models);
      if (port && port > 0) setServerPort(port);

      const status = await geniex
        .getServerStatus(useModelStore.getState().serverPort)
        .catch(() => null);
      if (status) setServerStatus(status);

      // The update check calls GitHub and can be slow: don't hold up the rest of startup.
      if (installed) {
        geniex
          .checkForCliUpdate()
          .then(setUpdateInfo)
          .catch(() => undefined);
      }
    })();
  }, [loadSessions, setModels, setUpdateInfo, setServerStatus, setCliInstalled, setServerPort]);

  // ── Listen for server crash (process exited unexpectedly) ──────
  useTauriEvent("server-stopped", () => {
    console.warn("[app] Server process exited unexpectedly");
    setServerStatus({ running: false, port: useModelStore.getState().serverPort, models: [] });
    useModelStore.getState().setServerCompute(null);
  });

  // ── Persist every session whose content changed (debounced) ───
  useEffect(() => {
    const dirty = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      for (const session of useChatStore.getState().sessions) {
        if (dirty.has(session.id)) db.saveSession(session).catch(() => undefined);
      }
      dirty.clear();
    };

    const unsubscribe = useChatStore.subscribe((state, prev) => {
      if (state.sessions === prev.sessions) return;
      const previous = new Map(prev.sessions.map((s) => [s.id, s]));
      for (const session of state.sessions) {
        if (previous.get(session.id) !== session) dirty.add(session.id);
      }
      clearTimeout(timer);
      timer = setTimeout(flush, SESSION_SAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
      flush();
    };
  }, []);

  // ── Listen for streaming chat chunks from Rust backend ────────
  useTauriEvent<{ streamId: string; content: string }>("chat-chunk", (payload) => {
    // Tokens go to the session that started the stream, even if the user switched chats since.
    const stream = useChatStore.getState().activeStream;
    if (!stream || stream.streamId !== payload.streamId) return;
    const activeId = stream.sessionId;
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
      db.saveMessage(activeId, assistantMsg).catch(() => undefined);
    }
  });

  useTauriEvent<{ streamId: string; finishReason: string | null }>("chat-done", (payload) => {
    const stream = useChatStore.getState().activeStream;
    if (!stream || stream.streamId !== payload.streamId) return;
    setStreaming(false);
    setActiveStream(null);

    const activeId = stream.sessionId;
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

    if (lastMsg.role === "assistant" && payload.finishReason) {
      store.updateMessageFinishReason(activeId, lastMsg.id, payload.finishReason);
    }

    if (lastMsg.role === "assistant" && lastMsg.content) {
      const stats: GenerationStats = { timeToFirstToken, totalTime, tokenCount, promptChars };
      store.updateMessageStats(activeId, lastMsg.id, stats);
      // `lastMsg` was read before the finish reason and stats were set, so build the saved copy
      // after both are known. Saving the stale copy would drop them from the database.
      const finalMsg: Message = {
        ...lastMsg,
        ...(payload.finishReason ? { finishReason: payload.finishReason } : {}),
        stats,
      };
      db.saveMessage(activeId, finalMsg).catch(() => undefined);
    }
  });

  // ── Listen for model import progress (GenieX cache registration) ──
  useTauriEvent<{ model: string }>("model-pull-start", (payload) => {
    const store = useDownloadStore.getState();
    store.upsert({ id: payload.model, label: payload.model });
    store.setStatus(payload.model, "importing");
  });

  useTauriEvent<{ model: string; message: string }>("model-pull-progress", (payload) => {
    useDownloadStore.getState().setImportingProgress(payload.model, payload.message);
  });

  useTauriEvent<{ model: string }>("model-pull-complete", (payload) => {
    useDownloadStore.getState().setStatus(payload.model, "finished");
    void refreshAfterImport(payload.model);
  });

  // ── Listen for file download progress (keyed by download id = repo id) ──
  useTauriEvent<{
    id: string;
    file: string;
    received?: number;
    total?: number | null;
    speed?: number;
    complete?: boolean;
    cancelled?: boolean;
  }>("download-progress", (payload) => {
    const store = useDownloadStore.getState();
    if (payload.cancelled) {
      store.setStatus(payload.id, "cancelled");
      return;
    }
    if (payload.complete) {
      // Record the final size so the bar reads 100%; the import status arrives via model-pull-start.
      const existing = store.downloads.find((d) => d.id === payload.id);
      if (existing && payload.total == null) {
        const finalSize = payload.received ?? existing.received;
        store.patchProgress(payload.id, finalSize, finalSize, 0);
      }
      return;
    }
    if (!store.downloads.some((d) => d.id === payload.id)) {
      store.upsert({ id: payload.id, label: payload.id, status: "downloading" });
    }
    store.patchProgress(
      payload.id,
      payload.received ?? 0,
      payload.total ?? null,
      payload.speed ?? 0,
    );
  });

  return <>{children}</>;
}

/**
 * After a successful import: refresh the CLI model list and persist the
 * metadata the model card shows. Both are best-effort.
 */
async function refreshAfterImport(repoId: string): Promise<void> {
  // Metadata first: the model list refresh triggers the chat context bar, which reads this row.
  try {
    const meta = await fetchDownloadedModelMeta(repoId);
    await db.upsertDownloadedModel(
      repoId,
      meta.precision ?? null,
      meta.contextSize ?? null,
      meta.paramCount ?? null,
      meta.repoUrl ?? null,
      meta.modelCard ?? null,
    );
  } catch {
    // metadata is a nice-to-have
  }
  try {
    useModelStore.getState().setModels(await geniex.listModels());
  } catch {
    // CLI list refresh is best-effort
  }
}

/**
 * Downloaded-model metadata from the local DB. The context size falls back to the
 * HF config.json when the DB row does not have it.
 */
export async function fetchDownloadedModelMeta(repoId: string): Promise<DownloadedModelMeta> {
  const rows = await db.listDownloadedModels();
  const row = rows.find((r) => r.name === repoId);
  // The Hub's GGUF metadata is the source of truth; the header value written at import is the fallback.
  const contextSize = (await fetchContextLength(repoId)) ?? row?.context_size ?? null;
  return {
    precision: row?.precision ?? undefined,
    contextSize: contextSize ?? undefined,
    paramCount: row?.param_count ?? undefined,
    repoUrl: row?.repo_url ?? undefined,
    modelCard: row?.model_card ?? undefined,
  };
}
