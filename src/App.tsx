import React, { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Button,
  Spinner,
  Toast,
  ToastBody,
  ToastTitle,
  Toaster,
  useToastController,
} from "@fluentui/react-components";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ChatArea from "./components/ChatArea";
import ChatInput from "./components/ChatInput";
import WelcomeScreen from "./components/WelcomeScreen";
import ModelBrowser from "./components/ModelBrowser";
import SettingsDrawer from "./components/SettingsDrawer";
import { useChatStore } from "./stores/chatStore";
import { useModelStore } from "./stores/modelStore";
import * as db from "./services/database";
import * as geniex from "./services/geniex";
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

export default function App() {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const updateLastAssistantMessage = useChatStore((s) => s.updateLastAssistantMessage);
  const setStreaming = useChatStore((s) => s.setStreaming);
  const lastSendTime = useChatStore((s) => s.lastSendTime);

  const setModels = useModelStore((s) => s.setModels);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setServerPort = useModelStore((s) => s.setServerPort);
  const setCliInstalled = useModelStore((s) => s.setCliInstalled);
  const cliInstalled = useModelStore((s) => s.cliInstalled);
  const setUpdateInfo = useModelStore((s) => s.setUpdateInfo);
  const updateInfo = useModelStore((s) => s.updateInfo);

  const [showModelBrowser, setShowModelBrowser] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<"app" | "model" | null>(null);
  const [installingCli, setInstallingCli] = React.useState(false);
  const [installStatus, setInstallStatus] = React.useState<string | null>(null);
  const { dispatchToast } = useToastController("app-toaster");

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
  }, []);

  // ── Listen for server crash (process exited unexpectedly) ──────
  useEffect(() => {
    const unlisten = listen("server-stopped", () => {
      console.warn("[app] Server process exited unexpectedly");
      setServerStatus({ running: false, port: useModelStore.getState().serverPort, models: [] });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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
  }, [sessions, activeSessionId, persistSession]);

  // ── Listen for streaming chat chunks from Rust backend ────────
  useEffect(() => {
    const unlisten = listen<{ content: string }>("chat-chunk", (event) => {
      if (!activeSessionId) return;
      const store = useChatStore.getState();
      const session = store.sessions.find((s) => s.id === activeSessionId);
      if (!session) return;

      tokenCountRef.current += 1;

      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        // Append to existing assistant message
        updateLastAssistantMessage(activeSessionId, lastMsg.content + event.payload.content);
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
        store.addMessage(activeSessionId, assistantMsg);
        // Persist immediately so the message survives app restarts mid-stream
        db.saveMessage(activeSessionId, assistantMsg).catch(() => {});
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [activeSessionId]);

  useEffect(() => {
    const unlisten = listen("chat-done", () => {
      setStreaming(false);

      if (!activeSessionId) return;
      const store = useChatStore.getState();
      const session = store.sessions.find((s) => s.id === activeSessionId);
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
        store.updateMessageStats(activeSessionId, lastMsg.id, {
          timeToFirstToken,
          totalTime,
          tokenCount,
          promptChars,
        });
        db.saveMessage(activeSessionId, lastMsg).catch(() => {});
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [activeSessionId, lastSendTime]);

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

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="app-layout">
      <Sidebar
        onOpenModelBrowser={() => setShowModelBrowser(true)}
        onOpenAppSettings={() => setSettingsTab("app")}
        updateInfo={updateInfo}
        onDismissUpdate={() => setUpdateInfo(null)}
      />
      <div className="main-area">
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
                          The GenieX installer launched. Complete the installation and restart the app if needed.
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
        <Header onOpenModelSettings={() => setSettingsTab("model")} />
        {activeSession ? <ChatArea /> : <WelcomeScreen />}
        {activeSession && <ChatInput />}
      </div>

      {showModelBrowser && <ModelBrowser onClose={() => setShowModelBrowser(false)} />}
      {settingsTab && (
        <SettingsDrawer defaultTab={settingsTab} onClose={() => setSettingsTab(null)} />
      )}
      <Toaster toasterId="app-toaster" />
    </div>
  );
}
