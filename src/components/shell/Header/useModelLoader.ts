import { useEffect, useState } from "react";
import { useTauriEvent } from "../../../hooks";
import * as geniex from "../../../services/geniex";
import { loadModelOnCompute, ramRefusal, resolveModelCompute } from "../../../services/modelLoad";
import { useChatStore } from "../../../stores/chatStore";
import { type ComputeChoice, useModelStore } from "../../../stores/modelStore";
import type { ServerStoppedEvent } from "../../../types";
import { deviceMismatchMessage } from "../../../utils/deviceCheck";
import {
  computeHoldingModel,
  loadedComputes,
  loadedEntryOnPort,
  stoppedStatus,
} from "../../../utils/loadedServers";
import { shortModelKey } from "../../../utils/modelKey";
import { COMPUTE_PORT_LABELS, stopAffectsMainServer } from "../../../utils/serverPorts";
import { toast } from "../../../utils/toast";

/** Key used for `loading` while models are being unloaded. */
export const LOADING_UNLOAD = "__unload__";

/** How a `selectModel` call ended. */
export type SelectOutcome = "loaded" | "switched" | "needs-replace" | "blocked" | "failed";

export interface SelectOptions {
  /** Stop the model on the same compute first, when that compute already holds another model. */
  replace?: boolean;
}

/**
 * Owns the model lifecycle shown in the top bar. Each model is loaded on the GenieX server of its
 * compute (one loaded model per compute, each on its own port), and one loaded model is active: chat
 * talks to its server. Switching the active model is instant. Results go to the model store;
 * components read them from there. Outcomes the user waited on are reported as toasts.
 */
export function useModelLoader() {
  const setServerStatus = useModelStore((s) => s.setServerStatus);
  const setLoadedServer = useModelStore((s) => s.setLoadedServer);
  const setActiveCompute = useModelStore((s) => s.setActiveCompute);
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

  // A server process exited on its own. Its loaded model is removed; a server with no loaded model
  // is the main server's business, as before.
  useTauriEvent<ServerStoppedEvent | null | undefined>("server-stopped", (payload) => {
    const state = useModelStore.getState();
    const port = payload?.port ?? state.serverPort;
    const exited = loadedEntryOnPort(state.loadedServers, port);
    if (exited) {
      const [exitedCompute, server] = exited;
      const label = COMPUTE_PORT_LABELS[exitedCompute];
      console.warn(`[app] ${label} server exited unexpectedly`);
      setLoadedServer(exitedCompute, null);
      toast.error(
        `${label} server stopped`,
        `${shortModelKey(server.model)} was unloaded: the server process exited.`,
      );
      return;
    }
    if (!stopAffectsMainServer(payload, state.mainServerPort)) return;
    console.warn("[app] Server process exited unexpectedly");
    setServerStatus(stoppedStatus(state.mainServerPort));
    setServerOptions(null);
    toast.error("GenieX server stopped", "The server process exited unexpectedly.");
  });

  /**
   * Makes `name` the active model. A model already loaded on some compute is switched to. Otherwise
   * it is loaded on the server of its compute, after a RAM check. When that compute holds another
   * model, `replace` stops that model first; without it the call returns "needs-replace" and does
   * nothing.
   */
  const selectModel = async (name: string, opts: SelectOptions = {}): Promise<SelectOutcome> => {
    const key = shortModelKey(name);
    const existing = computeHoldingModel(useModelStore.getState().loadedServers, name);
    if (existing !== null) {
      setActiveCompute(existing);
      setSelectorOpen(false);
      return "switched";
    }

    setError(null);
    setLoading(name);
    try {
      const target = await resolveModelCompute(name);
      const occupant = useModelStore.getState().loadedServers[target];
      if (occupant && !opts.replace) return "needs-replace";

      const refusal = await ramRefusal(name, occupant?.model ?? null);
      if (refusal !== null) {
        setError(refusal);
        toast.error("Not enough memory to load", `${key}: ${refusal}`);
        return "blocked";
      }

      if (occupant) {
        await geniex.stopServer(occupant.port);
        setLoadedServer(target, null);
      }

      const server = await loadModelOnCompute(name, target);
      setLoadedServer(target, server);
      setActiveCompute(target);
      const activeId = useChatStore.getState().activeSessionId;
      if (activeId) useChatStore.getState().setSessionModel(activeId, name);
      const mismatch = deviceMismatchMessage(target, server.device);
      if (mismatch !== null) {
        toast.warning("Model may not run on the requested unit", mismatch);
      }
      setSelectorOpen(false);
      toast.success(`Model loaded on ${COMPUTE_PORT_LABELS[target]}`, key);
      return "loaded";
    } catch (err) {
      setError(String(err));
      toast.error("Model failed to load", `${key}: ${String(err)}`);
      return "failed";
    } finally {
      setLoading(null);
    }
  };

  /** Makes a loaded model active. Nothing reloads. */
  const switchActive = (target: ComputeChoice) => {
    setActiveCompute(target);
  };

  /** Stops one compute's server, which unloads its model. The other loaded models are kept. */
  const unloadCompute = async (target: ComputeChoice) => {
    const server = useModelStore.getState().loadedServers[target];
    if (!server) return;
    setLoading(LOADING_UNLOAD);
    setError(null);
    try {
      await geniex.stopServer(server.port);
      setLoadedServer(target, null);
      toast.info(`${COMPUTE_PORT_LABELS[target]} model unloaded`, shortModelKey(server.model));
    } catch (err) {
      setError(String(err));
      toast.error("Unload failed", String(err));
    } finally {
      setLoading(null);
    }
  };

  /** Stops every GenieX server the app runs, which unloads every model. */
  const unloadAll = async () => {
    setLoading(LOADING_UNLOAD);
    setError(null);
    try {
      await geniex.stopAllServers();
      for (const target of loadedComputes(useModelStore.getState().loadedServers)) {
        setLoadedServer(target, null);
      }
      setServerStatus(stoppedStatus(useModelStore.getState().serverPort));
      setServerOptions(null);
      toast.info("Models unloaded");
    } catch (err) {
      setError(String(err));
      toast.error("Unload failed", String(err));
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
  };

  return {
    loading,
    error,
    selectModel,
    switchActive,
    unloadCompute,
    unloadAll,
    changeCompute,
    resolveModelCompute,
  };
}

/** What the model selector and the header need from `useModelLoader`. */
export type ModelLoader = ReturnType<typeof useModelLoader>;
