import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { ModelLoadParams } from "../types";
import { engineOf, modelSettingsKey, resolveLoadParams } from "../utils/modelSettings";
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
export async function unloadModels(): Promise<void> {
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
