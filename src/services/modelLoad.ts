import { useChatStore } from "../stores/chatStore";
import { useModelStore } from "../stores/modelStore";
import type { ComputeTarget, ModelLoadParams } from "../types";
import { computeForLoad, type LoadedServer, loadedServerFrom } from "../utils/loadedServers";
import {
  DEFAULT_CONTEXT_WINDOW,
  engineOf,
  modelSettingsKey,
  resolveLoadParams,
} from "../utils/modelSettings";
import { ramGateMessage } from "../utils/ramGate";
import * as db from "./database";
import * as geniex from "./geniex";
import { modelRamBytes } from "./modelRam";
import { getRamHeadroomPercent } from "./ramHeadroom";
import { serverPortForCompute } from "./serverPorts";
import { getSystemMemory } from "./system";

/**
 * Load parameters for `name` on `compute`, from its saved settings. Read from storage, so unsaved
 * edits in the settings screen are not used.
 */
export async function loadParamsFor(
  name: string,
  compute: ComputeTarget,
): Promise<ModelLoadParams> {
  const key = modelSettingsKey(name);
  const model = useModelStore.getState().models.find((m) => m.name === name);
  const saved = await db.loadModelSettings(key).catch(() => ({}));
  const nativeContext = await db.loadNativeContext(key).catch(() => null);
  return resolveLoadParams(saved, engineOf(model), compute, nativeContext);
}

/**
 * Load parameters a model is started and chatted with, from its saved settings, on the default
 * compute. Read from storage, so unsaved edits in the settings screen are not used.
 */
export async function savedLoadParams(name: string): Promise<ModelLoadParams> {
  return loadParamsFor(name, useModelStore.getState().compute);
}

/** The compute a model would load on: its saved compute setting, else the default compute. */
export async function resolveModelCompute(name: string): Promise<ComputeTarget> {
  return computeForLoad(await savedLoadParams(name), useModelStore.getState().compute);
}

/**
 * Why `name` may not load for RAM, or null when it may. `replaced` is the model whose server is
 * stopped first, so its RAM counts as free. Unknown figures never block.
 */
export async function ramRefusal(name: string, replaced: string | null): Promise<string | null> {
  const [estimateBytes, memory, headroomPercent, replacedBytes] = await Promise.all([
    modelRamBytes(name),
    getSystemMemory().catch(() => null),
    getRamHeadroomPercent(),
    replaced === null ? null : modelRamBytes(replaced),
  ]);
  return ramGateMessage({
    estimateBytes,
    memory,
    headroomPercent,
    freedBytes: replacedBytes ?? 0,
  });
}

/**
 * Starts the GenieX server for `compute` on `port`, unless one already answers there. Returns true
 * when this call started it, so the caller can stop it again if the load fails.
 */
export async function ensureComputeServer(compute: ComputeTarget, port: number): Promise<boolean> {
  const running = await geniex
    .getServerStatus(port)
    .then((status) => status.running)
    .catch(() => false);
  if (running) return false;
  const settings = await db.getLoadedServerSettings();
  await geniex.startServer({ port, compute, ...settings });
  return true;
}

/** Loads `name` on the server at `port` with `params`. Returns the entry for that server. */
export async function loadModelOnServer(
  name: string,
  params: ModelLoadParams,
  compute: ComputeTarget,
  port: number,
): Promise<LoadedServer> {
  const status = await geniex.loadModel(name, params, geniex.serverBaseUrl(port));
  return loadedServerFrom({
    compute,
    port,
    model: name,
    nctx: params.nctx ?? DEFAULT_CONTEXT_WINDOW,
    status,
  });
}

/**
 * Loads `name` on the server of `compute`, starting that server first when nothing answers on its
 * port. When this call started the server and the load fails, the server is stopped again.
 */
export async function loadModelOnCompute(
  name: string,
  compute: ComputeTarget,
): Promise<LoadedServer> {
  const port = await serverPortForCompute(compute);
  const started = await ensureComputeServer(compute, port);
  try {
    const params = await loadParamsFor(name, compute);
    return await loadModelOnServer(name, params, compute, port);
  } catch (err) {
    if (started) await geniex.stopServer(port).catch(() => undefined);
    throw err;
  }
}

/**
 * Reloads a model on the server of its compute. That server is stopped (which unloads its model),
 * started again and the model loaded with `load`, or with its saved settings when `load` is not
 * given. The model becomes the active one. Reads the store at each step.
 */
export async function reloadModel(name: string, load?: ModelLoadParams): Promise<void> {
  const store = () => useModelStore.getState();
  const params = load ?? (await savedLoadParams(name));
  const compute = computeForLoad(params, store().compute);

  const current = store().loadedServers[compute];
  if (current) {
    await geniex.stopServer(current.port);
    store().setLoadedServer(compute, null);
  }
  const port = current?.port ?? (await serverPortForCompute(compute));
  await ensureComputeServer(compute, port);

  const server = await loadModelOnServer(name, params, compute, port);
  store().setLoadedServer(compute, server);
  store().setActiveCompute(compute);
  const activeId = useChatStore.getState().activeSessionId;
  if (activeId) useChatStore.getState().setSessionModel(activeId, name);
}
