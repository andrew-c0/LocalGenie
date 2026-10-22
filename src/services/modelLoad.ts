import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import { engineOf, modelSettingsKey, resolveLoadParams } from "../utils/modelSettings";
import * as db from "./database";
import * as geniex from "./geniex";

/**
 * Reloads a model with its saved settings. The server has no per-model unload, so this stops the
 * server (which unloads every model), starts it again, and loads `name`. Reads the stores at each
 * step, so it does not depend on a React render having happened in between.
 */
export async function reloadModel(name: string): Promise<void> {
  const store = () => useModelStore.getState();
  const port = store().serverPort;

  const stopped = await geniex.unloadAllModels(port);
  store().setServerStatus(stopped);
  store().setServerOptions(null);
  store().setActiveModel(null);

  const serverSettings = await db.getServerSettings();
  const started = await geniex.startServer({ port, ...serverSettings });
  store().setServerStatus(started);
  store().setServerOptions(serverSettings);

  const key = modelSettingsKey(name);
  const model = store().models.find((m) => m.name === name);
  const saved = await db.loadModelSettings(key);
  const nativeContext = await db.loadNativeContext(key);
  const load = resolveLoadParams(saved, engineOf(model), store().compute, nativeContext);

  const status = await geniex.loadModel(name, load);
  store().setServerStatus(status);
  store().setActiveModel(name);
  const activeId = useChatStore.getState().activeSessionId;
  if (activeId) useChatStore.getState().setSessionModel(activeId, name);
}
