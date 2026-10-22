import { useEffect, useState } from "react";
import { useTauriEvent } from "../../../hooks";
import * as geniex from "../../../services/geniex";
import { useChatStore } from "../../../stores/chatStore";
import { type ComputeChoice, DEFAULT_COMPUTE, useModelStore } from "../../../stores/modelStore";
import { toast } from "../../../utils/toast";

/** Key used for `loading` while the compute target is being switched. */
export const LOADING_COMPUTE = "__compute__";
/** Key used for `loading` while all models are being unloaded. */
export const LOADING_UNLOAD = "__unload__";

/**
 * Owns the model lifecycle shown in the top bar: starting the GenieX server, loading a model onto
 * it, switching the compute target (NPU/GPU/CPU, which restarts the server) and unloading. Results
 * go to the model store; components read them from there. Outcomes that the user waited on are
 * reported as toasts.
 */
export function useModelLoader() {
  const serverStatus = useModelStore((s) => s.serverStatus);
  const serverPort = useModelStore((s) => s.serverPort);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const compute = useModelStore((s) => s.compute);
  const setCompute = useModelStore((s) => s.setCompute);
  const serverCompute = useModelStore((s) => s.serverCompute);
  const setServerCompute = useModelStore((s) => s.setServerCompute);

  /** Model name, or one of the LOADING_* keys, while an action is in progress. */
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Compute target the running server was started with; unknown (external) servers are assumed default. */
  const runningCompute = serverCompute ?? DEFAULT_COMPUTE;

  // A new popover session starts with no stale error.
  useEffect(() => {
    if (selectorOpen) setError(null);
  }, [selectorOpen]);

  // The server process exited on its own.
  useTauriEvent("server-stopped", () => {
    console.warn("[app] Server process exited unexpectedly");
    setServerStatus({ running: false, port: useModelStore.getState().serverPort, models: [] });
    setServerCompute(null);
    toast.error("GenieX server stopped", "The server process exited unexpectedly.");
  });

  /** Load a model and make it active. Starts or restarts the server first if needed. */
  const selectModel = async (name: string) => {
    const base = name.split("/").pop() ?? name;
    if (serverStatus.models.some((lm) => lm === base || lm.startsWith(`${base}:`))) {
      setActiveModel(name);
      setSelectorOpen(false);
      return;
    }
    setLoading(name);
    setError(null);
    try {
      // A server spawned with a different compute target must be restarted for the flag to apply.
      const needsRestart = serverStatus.running && compute !== runningCompute;
      if (needsRestart) {
        await geniex.stopServer(serverPort);
      }
      if (needsRestart || !serverStatus.running) {
        const started = await geniex.startServer({ port: serverPort, compute });
        setServerStatus(started);
        setServerCompute(compute);
      }
      const status = await geniex.loadModel(name);
      setServerStatus(status);
      setActiveModel(name);
      const activeId = useChatStore.getState().activeSessionId;
      if (activeId) useChatStore.getState().setSessionModel(activeId, name);
      setSelectorOpen(false);
      toast.success(`Model loaded on ${compute.toUpperCase()}`, base);
    } catch (err) {
      setError(String(err));
      toast.error("Model failed to load", `${base}: ${String(err)}`);
    } finally {
      setLoading(null);
    }
  };

  /** Switch the compute target; restarts the server when it is running. */
  const changeCompute = async (next: ComputeChoice) => {
    const prev = compute;
    setCompute(next);
    if (!serverStatus.running || next === prev) return;
    setLoading(LOADING_COMPUTE);
    setError(null);
    try {
      await geniex.stopServer(serverPort);
      setServerCompute(null);
      const started = await geniex.startServer({ port: serverPort, compute: next });
      setServerStatus(started);
      setServerCompute(next);
      toast.success(`Server now runs on ${next.toUpperCase()}`);
    } catch (err) {
      setCompute(prev);
      setError(String(err));
      toast.error("Could not switch compute target", String(err));
    } finally {
      setLoading(null);
    }
  };

  /** Unload all models from the server (stops the server, the only unload mechanism). */
  const unloadAll = async () => {
    setLoading(LOADING_UNLOAD);
    setError(null);
    try {
      const status = await geniex.unloadAllModels(serverPort);
      setServerStatus(status);
      setActiveModel(null);
      toast.info("Models unloaded");
    } catch (err) {
      setError(String(err));
      toast.error("Unload failed", String(err));
    } finally {
      setLoading(null);
    }
  };

  return { loading, error, selectModel, changeCompute, unloadAll };
}
