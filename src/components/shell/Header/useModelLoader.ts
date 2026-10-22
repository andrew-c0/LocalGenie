import { useEffect, useState } from "react";
import { useTauriEvent } from "../../../hooks";
import * as db from "../../../services/database";
import * as geniex from "../../../services/geniex";
import { useChatStore } from "../../../stores/chatStore";
import { type ComputeChoice, useModelStore } from "../../../stores/modelStore";
import type { ModelLoadSettings } from "../../../types";
import {
  engineOf,
  modelSettingsKey,
  resolveLoadParams,
  sameServerOptions,
} from "../../../utils/modelSettings";
import { toast } from "../../../utils/toast";

/** Key used for `loading` while all models are being unloaded. */
export const LOADING_UNLOAD = "__unload__";

/**
 * Owns the model lifecycle shown in the top bar: starting the GenieX server, loading a model onto
 * it and unloading. A model is loaded with its saved load parameters (compute, context, GPU layers,
 * power mode, speculation); chat requests send the same parameters, so the server does not reload.
 * Only origins and keepalive need a server restart. Results go to the model store; components read
 * them from there. Outcomes that the user waited on are reported as toasts.
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
  const serverOptions = useModelStore((s) => s.serverOptions);
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
    const base = name.split("/").pop() ?? name;
    if (serverStatus.models.some((lm) => lm === base || lm.startsWith(`${base}:`))) {
      setActiveModel(name);
      setSelectorOpen(false);
      return;
    }
    setLoading(name);
    setError(null);
    try {
      const model = useModelStore.getState().models.find((m) => m.name === name);
      const savedJson = await db.loadModelSettings(modelSettingsKey(name)).catch(() => null);
      const saved: ModelLoadSettings = savedJson ? JSON.parse(savedJson) : {};

      const serverSettings = await db.getServerSettings();
      // A server started with other origins or keepalive must restart. An external server
      // (settings unknown) is reused as it is.
      const needsRestart =
        serverStatus.running &&
        serverOptions !== null &&
        !sameServerOptions(serverOptions, serverSettings);
      if (needsRestart) {
        await geniex.stopServer(serverPort);
      }
      if (needsRestart || !serverStatus.running) {
        const started = await geniex.startServer({ port: serverPort, ...serverSettings });
        setServerStatus(started);
        setServerOptions(serverSettings);
      }

      const load = resolveLoadParams(saved, engineOf(model), compute);
      const status = await geniex.loadModel(name, load);
      setServerStatus(status);
      setActiveModel(name);
      const activeId = useChatStore.getState().activeSessionId;
      if (activeId) useChatStore.getState().setSessionModel(activeId, name);
      setSelectorOpen(false);
      const where = load.compute ? ` on ${load.compute.toUpperCase()}` : "";
      toast.success(`Model loaded${where}`, base);
    } catch (err) {
      setError(String(err));
      toast.error("Model failed to load", `${base}: ${String(err)}`);
    } finally {
      setLoading(null);
    }
  };

  /**
   * Switch the default compute target. Models without their own compute setting use it, and the
   * change takes effect with the next message, so nothing restarts here.
   */
  const changeCompute = (next: ComputeChoice) => {
    if (next === compute) return;
    setCompute(next);
    toast.info(`Compute set to ${next.toUpperCase()}`, "Applies to the next message.");
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
