import { useCallback, useState } from "react";
import { Button, Spinner, Tooltip, MessageBar, MessageBarBody } from "@fluentui/react-components";
import {
  PlugConnectedRegular,
  PlugDisconnectedRegular,
  PlayRegular,
  StopRegular,
} from "@fluentui/react-icons";
import { useModelStore } from "../stores/modelStore";
import { useChatStore } from "../stores/chatStore";
import * as geniex from "../services/geniex";

export default function ModelSelector() {
  const models = useModelStore((s) => s.models);
  const serverStatus = useModelStore((s) => s.serverStatus);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const serverPort = useModelStore((s) => s.serverPort);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setSessionModel = useChatStore((s) => s.setSessionModel);
  const [loadingModel, setLoadingModel] = useState<string | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadedModels = serverStatus.models;

  /** Check if a model is loaded (matches bare name or with precision suffix). */
  const isModelLoaded = useCallback(
    (modelName: string) =>
      loadedModels.some((lm) => lm === modelName || lm.startsWith(`${modelName}:`)),
    [loadedModels],
  );

  /** Ensure server is running, starting it if needed. */
  const ensureServer = useCallback(async (): Promise<boolean> => {
    if (serverStatus.running) return true;
    setServerLoading(true);
    setError(null);
    try {
      const status = await geniex.startServer({ port: serverPort });
      setServerStatus(status);
      if (!status.running) {
        setError("Server started but is not responding yet. Try again in a moment.");
        return false;
      }
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setServerLoading(false);
    }
  }, [serverStatus.running, setServerStatus, serverPort]);

  /** Load a model: start server -> send warmup -> set as session model. */
  const handleLoad = useCallback(
    async (modelName: string) => {
      setError(null);
      setLoadingModel(modelName);
      try {
        if (!(await ensureServer())) return;

        // Strip precision suffix — server auto-selects available quantization
        const bareName = modelName.includes(":") ? modelName.split(":")[0] : modelName;

        const refreshed = await geniex.loadModel(bareName, `http://127.0.0.1:${serverPort}`);
        setServerStatus(refreshed);
        setActiveModel(bareName);

        if (activeSessionId) {
          setSessionModel(activeSessionId, bareName);
        }
      } catch (err) {
        setError(`Load failed: ${String(err)}`);
      } finally {
        setLoadingModel(null);
      }
    },
    [activeSessionId, ensureServer, setServerStatus, setActiveModel, setSessionModel, serverPort],
  );

  /** Stop server (unloads all models). */
  const handleStopServer = useCallback(async () => {
    setServerLoading(true);
    setError(null);
    try {
      const status = await geniex.stopServer(serverPort);
      setServerStatus(status);
    } catch (err) {
      setError(String(err));
    } finally {
      setServerLoading(false);
    }
  }, [setServerStatus, serverPort]);

  /** Start server. */
  const handleStartServer = useCallback(async () => {
    setServerLoading(true);
    setError(null);
    try {
      const status = await geniex.startServer({ port: serverPort });
      setServerStatus(status);
      if (!status.running) {
        setError(
          "Server did not start. Check that `geniex` is in your PATH and the port is available.",
        );
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setServerLoading(false);
    }
  }, [setServerStatus, serverPort]);

  return (
    <div className="ms-model-list-root">
      {/* Server status + controls */}
      <div className="ms-server-controls">
        {serverStatus.running ? (
          <PlugConnectedRegular className="ms-server-status-icon ms-server-icon-on" />
        ) : (
          <PlugDisconnectedRegular className="ms-server-status-icon ms-server-icon-off" />
        )}
        <span className="ms-server-status-text">
          {serverStatus.running ? "Server running" : "Server stopped"}
        </span>
        {serverLoading ? (
          <Spinner size="tiny" />
        ) : serverStatus.running ? (
          <Tooltip content="Stop server" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<StopRegular />}
              onClick={handleStopServer}
            />
          </Tooltip>
        ) : (
          <Tooltip content="Start server" relationship="label">
            <Button
              appearance="subtle"
              size="small"
              icon={<PlayRegular />}
              onClick={handleStartServer}
            />
          </Tooltip>
        )}
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {/* Model list */}
      {models.length === 0 ? (
        <div className="ms-empty-state">No models found. Pull a model first.</div>
      ) : (
        <div className="ms-model-list">
          {models.map((model) => {
            const loaded = isModelLoaded(model.name);
            const busy = loadingModel === model.name;

            return (
              <div key={model.name} className={`ms-model-item${loaded ? " loaded" : ""}`}>
                <div className="ms-model-item-info">
                  <div className="ms-model-name" title={model.name}>
                    {model.name}
                  </div>
                  <div className="ms-model-meta">
                    {model.size}
                    {loaded && <span className="ms-model-loaded-dot">● loaded</span>}
                  </div>
                </div>

                {busy ? (
                  <div className="ms-model-busy">
                    <Spinner size="tiny" />
                    <span>Loading…</span>
                  </div>
                ) : loaded ? (
                  <span className="ms-model-active">✓ Active</span>
                ) : (
                  <Button
                    appearance="primary"
                    size="small"
                    onClick={() => handleLoad(model.name)}
                    className="ms-load-btn"
                  >
                    Load
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
