import {
  Button,
  Spinner,
  Toast,
  ToastBody,
  Toaster,
  ToastTitle,
  useToastController,
} from "@fluentui/react-components";
import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useRef } from "react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import Header from "./components/shell/Header";
import Sidebar from "./components/shell/Sidebar";
import BenchmarkPlayground from "./pages/benchmark/BenchmarkPlayground";
import PerformanceDashboard from "./pages/benchmark/PerformanceDashboard";
import ChatPage from "./pages/ChatPage";
import ModelLibraryPage from "./pages/ModelLibraryPage";
import OverviewPage from "./pages/OverviewPage";
import PromptBenchmarkPage from "./pages/PromptBenchmarkPage";
import SettingsPage from "./pages/SettingsPage";
import * as db from "./services/database";
import * as geniex from "./services/geniex";
import { useChatStore } from "./stores/chatStore";
import { useModelStore } from "./stores/modelStore";
import type { Message } from "./types";

/** Debounce a callback — cancels the previous pending call when invoked again. */
function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delayMs: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return ((...args: Parameters<T>) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
  }) as T;
}

/** App shell content — uses router hooks for the active view. */
function Shell() {
  const updateInfo = useModelStore((s) => s.updateInfo);
  const cliInstalled = useModelStore((s) => s.cliInstalled);
  const setCliInstalled = useModelStore((s) => s.setCliInstalled);
  const [installingCli, setInstallingCli] = React.useState(false);
  const [installStatus, setInstallStatus] = React.useState<string | null>(null);
  const { dispatchToast } = useToastController("app-toaster");

  return (
    <div className="lx-shell">
      <Sidebar />
      <div className="lx-main">
        {!cliInstalled && (
          <div className="cli-missing-banner">
            <span className="cli-missing-banner-icon">⚠️</span>
            <div className="cli-missing-banner-message">
              <span>GenieX CLI not found. Install it to use model management and chatting.</span>
              {installStatus && <span className="cli-missing-banner-detail">{installStatus}</span>}
            </div>
            <Button
              appearance="primary"
              size="small"
              onClick={async () => {
                setInstallingCli(true);
                setInstallStatus("Downloading GenieX CLI...");
                try {
                  const result = await geniex.installGeniex();
                  setInstallStatus(result);
                  dispatchToast(
                    <Toast>
                      <ToastTitle>GenieX CLI Installer</ToastTitle>
                      <ToastBody>{result}</ToastBody>
                    </Toast>,
                    { intent: "success" },
                  );
                  const installed = await geniex.checkGeniexInstalled();
                  setCliInstalled(installed);
                  if (!installed) {
                    dispatchToast(
                      <Toast>
                        <ToastTitle>Installation started</ToastTitle>
                        <ToastBody>
                          The GenieX installer launched. Complete the installation and restart the
                          app if needed.
                        </ToastBody>
                      </Toast>,
                      { intent: "warning" },
                    );
                  }
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  setInstallStatus(`Install failed: ${message}`);
                  dispatchToast(
                    <Toast>
                      <ToastTitle>Install failed</ToastTitle>
                      <ToastBody>{message}</ToastBody>
                    </Toast>,
                    { intent: "error" },
                  );
                } finally {
                  setInstallingCli(false);
                }
              }}
              disabled={installingCli}
            >
              {installingCli ? <Spinner size="tiny" /> : "Install CLI"}
            </Button>
          </div>
        )}
        <Header />
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/models" element={<ModelLibraryPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/benchmark" element={<Navigate to="/prompt-benchmark" replace />} />
          <Route path="/prompt-benchmark" element={<PromptBenchmarkPage />}>
            <Route index element={<Navigate to="playground" replace />} />
            <Route path="playground" element={<BenchmarkPlayground />} />
            <Route path="dashboard" element={<PerformanceDashboard />} />
          </Route>
          <Route path="/settings" element={<SettingsPage updateInfo={updateInfo} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <Toaster toasterId="app-toaster" />
    </div>
  );
}

export default function App() {
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
  useEffect(() => {
    const unlisten = listen("server-stopped", () => {
      console.warn("[app] Server process exited unexpectedly");
      setServerStatus({ running: false, port: useModelStore.getState().serverPort, models: [] });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setServerStatus]);

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
  useEffect(() => {
    const unlisten = listen<{ content: string }>("chat-chunk", (event) => {
      const activeId = useChatStore.getState().activeSessionId;
      if (!activeId) return;
      const store = useChatStore.getState();
      const session = store.sessions.find((s) => s.id === activeId);
      if (!session) return;

      tokenCountRef.current += 1;

      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        // Append to existing assistant message
        updateLastAssistantMessage(activeId, lastMsg.content + event.payload.content);
      } else {
        // First chunk of a new response — reset per-response counters
        tokenCountRef.current = 1;
        firstTokenTimeRef.current = Date.now();
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: event.payload.content,
          timestamp: Date.now(),
          modelId: session.modelId ?? undefined,
        };
        store.addMessage(activeId, assistantMsg);
        // Persist immediately so the message survives app restarts mid-stream
        db.saveMessage(activeId, assistantMsg).catch(() => {});
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updateLastAssistantMessage]);

  useEffect(() => {
    const unlisten = listen("chat-done", () => {
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

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [lastSendTime, setStreaming]);

  // ── Listen for pull progress ──────────────────────────────────
  useEffect(() => {
    const unlisten = listen<{ model: string; message: string }>("model-pull-progress", (event) => {
      const { model, message } = event.payload;
      useModelStore.getState().addDownload({
        model,
        message,
        status: "downloading",
      });
    });
    const unlistenComplete = listen<{ model: string }>("model-pull-complete", async (event) => {
      const { model } = event.payload;
      useModelStore.getState().removeDownload(model);
      // Refresh model list
      try {
        const models = await geniex.listModels();
        useModelStore.getState().setModels(models);
      } catch {
        // ignore
      }
    });
    return () => {
      unlisten.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, []);

  return (
    <MemoryRouter initialEntries={["/"]}>
      <Shell />
    </MemoryRouter>
  );
}
