import { useChatStore } from "../stores/chatStore";
import { COMPUTE_TARGETS, type ComputeChoice, useModelStore } from "../stores/modelStore";
import type { ModelLoadParams, ModelLoadSettings } from "../types";
import { shortModelKey } from "../utils/modelKey";
import {
  DEFAULT_CONTEXT_WINDOW,
  engineOf,
  modelSettingsKey,
  resolveLoadParams,
  sameServerOptions,
} from "../utils/modelSettings";
import * as db from "./database";
import * as geniex from "./geniex";

/**
 * Load parameters a model is started and chatted with, from its saved settings. Read from storage,
 * so unsaved edits in the settings screen are not used.
 */
export async function savedLoadParams(name: string): Promise<ModelLoadParams> {
  const store = useModelStore.getState();
  const key = modelSettingsKey(name);
  const model = store.models.find((m) => m.name === name);
  const saved = await db.loadModelSettings(key);
  const nativeContext = await db.loadNativeContext(key);
  return resolveLoadParams(saved, engineOf(model), store.compute, nativeContext);
}

/**
 * Unloads every model. The server has no per-model unload, so this stops the server, and the store
 * is cleared to match. Rejects when the server cannot be stopped.
 */
async function unloadModels(): Promise<void> {
  const store = () => useModelStore.getState();
  const stopped = await geniex.unloadAllModels(store().serverPort);
  store().setServerStatus(stopped);
  store().setServerOptions(null);
  store().setActiveModel(null);
}

/**
 * Reloads a model. The server has no per-model unload, so this stops the server (which unloads every
 * model), starts it again, and loads `name` with `load`, or with its saved settings when `load` is
 * not given. Reads the stores at each step, so it does not depend on a React render having happened
 * in between.
 */
export async function reloadModel(name: string, load?: ModelLoadParams): Promise<void> {
  const store = () => useModelStore.getState();
  const port = store().serverPort;

  await unloadModels();

  const serverSettings = await db.getServerSettings();
  const started = await geniex.startServer({ port, ...serverSettings });
  store().setServerStatus(started);
  store().setServerOptions(serverSettings);

  const params = load ?? (await savedLoadParams(name));

  const status = await geniex.loadModel(name, params, geniex.serverBaseUrl(port));
  store().setServerStatus(status);
  store().setActiveModel(name);
  const activeId = useChatStore.getState().activeSessionId;
  if (activeId) useChatStore.getState().setSessionModel(activeId, name);
}

/** What `activateModel` loaded: the compute target it loaded on, or null when none was set. */
export interface ActivatedModel {
  compute: ComputeChoice | null;
}

/** True when the model is loaded on another compute target than the one it would load on now (its own setting, else the store's). */
async function loadedOnOtherCompute(name: string): Promise<boolean> {
  const loadedAs = useModelStore.getState().loadedCompute;
  if (loadedAs === null) return false;
  const key = modelSettingsKey(name);
  const [saved, nativeContext] = await Promise.all([
    db.loadModelSettings(key).catch(() => ({})),
    db.loadNativeContext(key).catch(() => null),
  ]);
  const model = useModelStore.getState().models.find((m) => m.name === name);
  const wanted = resolveLoadParams(
    saved,
    engineOf(model),
    useModelStore.getState().compute,
    nativeContext,
  ).compute;
  return wanted !== undefined && wanted !== loadedAs;
}

/**
 * Makes sure the server runs with the saved server settings. A server started with other origins or keepalive is
 * restarted; an external server (settings unknown) is reused as it is.
 */
async function ensureServer(): Promise<void> {
  const store = () => useModelStore.getState();
  const serverSettings = await db.getServerSettings();
  const { serverStatus, serverOptions, serverPort } = store();
  const needsRestart =
    serverStatus.running &&
    serverOptions !== null &&
    !sameServerOptions(serverOptions, serverSettings);
  if (needsRestart) await geniex.stopServer(serverPort);
  if (needsRestart || !serverStatus.running) {
    const started = await geniex.startServer({ port: serverPort, ...serverSettings });
    store().setServerStatus(started);
    store().setServerOptions(serverSettings);
  }
}

/**
 * Makes `name` the loaded model: the one path the header's selector and the Dispatch runner both use. It does not
 * record the model on any conversation; the caller does that. A model the server already has, on the compute
 * target it would load on now, is only made active (resolves null).
 * Otherwise the server is started, or restarted when its options differ, and the model is loaded with its saved
 * settings. `onLoadStart` runs right before that work, so a caller can show progress. Rejects with the raw error.
 */
export async function activateModel(
  name: string,
  onLoadStart?: () => void,
): Promise<ActivatedModel | null> {
  const store = () => useModelStore.getState();
  const key = shortModelKey(name);
  if (
    store().serverStatus.models.some((lm) => shortModelKey(lm) === key) &&
    !(await loadedOnOtherCompute(name))
  ) {
    store().setActiveModel(name);
    return null;
  }
  onLoadStart?.();

  const model = store().models.find((m) => m.name === name);
  const saved: ModelLoadSettings = await db
    .loadModelSettings(modelSettingsKey(name))
    .catch(() => ({}));
  await ensureServer();

  const nativeContext = await db.loadNativeContext(modelSettingsKey(name)).catch(() => null);
  const load = resolveLoadParams(saved, engineOf(model), store().compute, nativeContext);
  const { serverPort } = store();
  const status = await geniex.loadModel(name, load, geniex.serverBaseUrl(serverPort));
  store().setServerStatus(status);
  const compute = COMPUTE_TARGETS.find((c) => c === load.compute) ?? null;
  store().setLoadedCompute(compute);
  // Without a saved or native value the server applies its default window.
  store().setLoadedContext(load.nctx ?? DEFAULT_CONTEXT_WINDOW);
  store().setActiveModel(name);
  return { compute };
}
