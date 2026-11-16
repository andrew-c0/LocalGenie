import { useEffect, useState } from "react";
import { useTauriEvent } from "../../../hooks";
import * as geniex from "../../../services/geniex";
import { activateModel } from "../../../services/modelLoad";
import { useChatStore } from "../../../stores/chatStore";
import { type ComputeChoice, useModelStore } from "../../../stores/modelStore";
import { shortModelKey } from "../../../utils/modelKey";
import { toast } from "../../../utils/toast";

/** Key used for `loading` while all models are being unloaded. */
export const LOADING_UNLOAD = "__unload__";

/**
 * Owns the model lifecycle shown in the top bar: selecting a model (loading it, or starting the server it
 * needs), switching the compute target and unloading. The load itself is `activateModel` in
 * `services/modelLoad.ts`, which the Dispatch runner uses too. This hook adds the progress state, the error
 * text and the toasts the user waits on. Components read the results from the model store.
 */
export function useModelLoader() {
  const serverPort = useModelStore((s) => s.serverPort);
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setActiveModel = useModelStore((s) => s.setActiveModel);
  const selectorOpen = useModelStore((s) => s.selectorOpen);
  const setSelectorOpen = useModelStore((s) => s.setSelectorOpen);
  const compute = useModelStore((s) => s.compute);
  const setCompute = useModelStore((s) => s.setCompute);
  const setServerOptions = useModelStore((s) => s.setServerOptions);

  /** Model name, or LOADING_UNLOAD, while an action is in progress. */
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A new popover session starts with no stale error.
  useEffect(() => {
    if (selectorOpen) setError(null);
  }, [selectorOpen]);

  // The server process exited on its own.
  useTauriEvent("server-stopped", () => {
    console.warn("[app] Server process exited unexpectedly");
    setServerStatus({ running: false, port: useModelStore.getState().serverPort, models: [] });
    setServerOptions(null);
    toast.error("GenieX server stopped", "The server process exited unexpectedly.");
  });

  /** Load a model and make it active. Starts or restarts the server first if its server settings differ. */
  const selectModel = async (name: string) => {
    const key = shortModelKey(name);
    try {
      const activated = await activateModel(name, () => {
        setLoading(name);
        setError(null);
      });
      setSelectorOpen(false);
      if (activated) {
        // The open chat, if any, records the model it now runs on.
        const activeId = useChatStore.getState().activeSessionId;
        if (activeId) useChatStore.getState().setSessionModel(activeId, name);
        const where = activated.compute ? ` on ${activated.compute.toUpperCase()}` : "";
        toast.success(`Model loaded${where}`, key);
      }
    } catch (err) {
      setError(String(err));
      toast.error("Model failed to load", `${key}: ${String(err)}`);
    } finally {
      setLoading(null);
    }
  };

  /**
   * Switch the compute target. Every model loads on it, and the
   * change takes effect with the next message, so nothing restarts here.
   */
  const changeCompute = (next: ComputeChoice) => {
    if (next === compute) return;
    setCompute(next);
  };

  /** Unload all models from the server (stops the server, the only unload mechanism). */
  const unloadAll = async () => {
    setLoading(LOADING_UNLOAD);
    setError(null);
    try {
      const status = await geniex.unloadAllModels(serverPort);
      setServerStatus(status);
      setServerOptions(null);
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
