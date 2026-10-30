import type { ComputeTarget, ModelLoadParams, ServerStatus } from "../types";
import { shortModelKey } from "./modelKey";
import { COMPUTE_PORT_TARGETS, computeOfServer } from "./serverPorts";

/** A model loaded on its own GenieX server. At most one per compute. */
export interface LoadedServer {
  compute: ComputeTarget;
  /** Port of the server the model runs on. */
  port: number;
  /** Model name the server was loaded with. */
  model: string;
  /** Context window the model was loaded with. */
  nctx: number;
  /** Compute unit the server reports for the model. Null when the server does not say. */
  device: string | null;
  /** The server's status as read after the load. */
  status: ServerStatus;
}

export type LoadedServers = Partial<Record<ComputeTarget, LoadedServer>>;

/** The part of the model store that describes the servers. The reducers below read and write it. */
export interface ServerState {
  mainServerPort: number;
  serverPort: number;
  serverStatus: ServerStatus;
  loadedServers: LoadedServers;
  activeCompute: ComputeTarget | null;
  activeModelId: string | null;
  loadedCompute: ComputeTarget | null;
  loadedContext: number | null;
}

/** The fields that follow the active server. */
type ActiveFields = Pick<
  ServerState,
  | "activeCompute"
  | "serverPort"
  | "serverStatus"
  | "activeModelId"
  | "loadedCompute"
  | "loadedContext"
>;

type Entry = readonly [ComputeTarget, LoadedServer];

/** Loaded servers in display order, each with its compute. */
function entriesOf(loaded: LoadedServers): Entry[] {
  return COMPUTE_PORT_TARGETS.flatMap((compute): Entry[] => {
    const server = loaded[compute];
    return server ? [[compute, server]] : [];
  });
}

function findEntry(loaded: LoadedServers, match: (server: LoadedServer) => boolean): Entry | null {
  return entriesOf(loaded).find(([, server]) => match(server)) ?? null;
}

/** The compute of the first loaded server in display order, or null when none is loaded. */
export function pickActiveCompute(loaded: LoadedServers): ComputeTarget | null {
  return entriesOf(loaded)[0]?.[0] ?? null;
}

/** Computes that have a loaded server, in display order. */
export function loadedComputes(loaded: LoadedServers): ComputeTarget[] {
  return entriesOf(loaded).map(([compute]) => compute);
}

/** The compute whose loaded model is `model`, compared by base name (any `:precision` is ignored). */
export function computeHoldingModel(loaded: LoadedServers, model: string): ComputeTarget | null {
  const key = shortModelKey(model);
  return findEntry(loaded, (server) => shortModelKey(server.model) === key)?.[0] ?? null;
}

/** The loaded compute and its server for `port`, or null when no loaded server listens there. */
export function loadedEntryOnPort(loaded: LoadedServers, port: number): Entry | null {
  return findEntry(loaded, (server) => server.port === port);
}

/** The compute a model's load parameters name, else `fallback`. Engines that ignore compute give `fallback`. */
export function computeForLoad(params: ModelLoadParams, fallback: ComputeTarget): ComputeTarget {
  return computeOfServer(params.compute) ?? fallback;
}

/** Copy of `loaded` with `compute` set to `server`, or with that compute removed when `server` is null. */
export function withLoadedServer(
  loaded: LoadedServers,
  compute: ComputeTarget,
  server: LoadedServer | null,
): LoadedServers {
  if (server) return { ...loaded, [compute]: server };
  const next = { ...loaded };
  delete next[compute];
  return next;
}

/** The status of a server that is not running on `port`. */
export function stoppedStatus(port: number): ServerStatus {
  return { running: false, port, models: [] };
}

/**
 * The fields that follow the active server. With no active server (null, or one that is not loaded)
 * they fall back to the main port with nothing loaded.
 */
export function activeFields(
  loaded: LoadedServers,
  active: ComputeTarget | null,
  mainPort: number,
): ActiveFields {
  const server = active === null ? undefined : loaded[active];
  if (server === undefined) {
    return {
      activeCompute: null,
      serverPort: mainPort,
      serverStatus: stoppedStatus(mainPort),
      activeModelId: null,
      loadedCompute: null,
      loadedContext: null,
    };
  }
  return {
    activeCompute: server.compute,
    serverPort: server.port,
    serverStatus: server.status,
    activeModelId: server.model,
    loadedCompute: server.compute,
    loadedContext: server.nctx,
  };
}

/** The unit a server reports for `model` (matched by base name), or null when it does not say. */
export function deviceForModel(
  devices: { id: string; device: string }[] | undefined,
  model: string,
): string | null {
  const key = shortModelKey(model);
  return devices?.find((entry) => shortModelKey(entry.id) === key)?.device ?? null;
}

/** A server entry built from the status read after a load. */
export function loadedServerFrom(input: {
  compute: ComputeTarget;
  port: number;
  model: string;
  nctx: number;
  status: ServerStatus;
}): LoadedServer {
  const { compute, port, model, nctx, status } = input;
  return { compute, port, model, nctx, device: deviceForModel(status.devices, model), status };
}

/** `current` when the server still lists it, else the first listed model, else null. */
export function keepOrFirst(current: string | null, models: string[]): string | null {
  if (current !== null && models.includes(current)) return current;
  return models[0] ?? null;
}

/** Reducer for `setServerPort`. The active server's port is left alone while a server is loaded. */
export function serverPortUpdate(state: ServerState, port: number): Partial<ServerState> {
  if (state.activeCompute !== null) return { mainServerPort: port };
  return { mainServerPort: port, serverPort: port, serverStatus: { ...state.serverStatus, port } };
}

/**
 * Reducer for `setLoadedServer`. Setting a server for the active compute updates the active fields.
 * Removing the active compute's server makes the first other loaded compute active, if there is one.
 */
export function loadedServerUpdate(
  state: ServerState,
  compute: ComputeTarget,
  server: LoadedServer | null,
): Partial<ServerState> {
  const loadedServers = withLoadedServer(state.loadedServers, compute, server);
  if (state.activeCompute !== compute) return { loadedServers };
  const next = server === null ? pickActiveCompute(loadedServers) : compute;
  return { loadedServers, ...activeFields(loadedServers, next, state.mainServerPort) };
}

/** Reducer for `setActiveCompute`. An unloaded compute cannot become active, so the call is ignored. */
export function activeComputeUpdate(
  state: ServerState,
  compute: ComputeTarget | null,
): Partial<ServerState> {
  if (compute !== null && state.loadedServers[compute] === undefined) return {};
  return activeFields(state.loadedServers, compute, state.mainServerPort);
}

/**
 * Reducer for `setServerStatus`. A status for a loaded server updates that server's entry, and
 * removes it once the server stops or lists no model. A status for another port updates the active
 * fields only when it is for the active port (or the main port when none is active); anything else
 * is not this app's server to report.
 */
export function serverStatusUpdate(state: ServerState, status: ServerStatus): Partial<ServerState> {
  const entry = loadedEntryOnPort(state.loadedServers, status.port);
  if (entry !== null) {
    const [compute, current] = entry;
    const alive = status.running && status.models.length > 0;
    const server = alive
      ? {
          ...current,
          status,
          model: keepOrFirst(current.model, status.models) ?? current.model,
        }
      : null;
    return loadedServerUpdate(state, compute, server);
  }
  if (status.port !== state.serverPort) return {};
  const listed = status.models.length > 0;
  return {
    serverStatus: status,
    activeModelId: keepOrFirst(state.activeModelId, status.models),
    loadedCompute: listed ? state.loadedCompute : null,
    loadedContext: listed ? state.loadedContext : null,
  };
}
