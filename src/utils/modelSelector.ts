import type { ComputeTarget, ModelInfo } from "../types";
import { computeHoldingModel, type LoadedServer, type LoadedServers } from "./loadedServers";
import { shortModelKey } from "./modelKey";
import { estimatedRamBytes, type RamSnapshot } from "./modelRam";
import { COMPUTE_PORT_LABELS, COMPUTE_PORT_TARGETS } from "./serverPorts";

/** The compute a model would load on, by model name. Filled in when the selector opens. */
export type ResolvedComputes = Partial<Record<string, ComputeTarget>>;

/** One installed model as the selector shows it. */
export interface SelectorRow {
  model: ModelInfo;
  /**
   * For a loaded row, the compute the model is loaded on (null when the server does not say). For a
   * ready row, the compute a load would use (null while it is not known yet).
   */
  compute: ComputeTarget | null;
  /** Compute unit the server reports for a loaded model. Null when unknown. */
  device: string | null;
  /** Loaded on a server of this app, or the active model. */
  loaded: boolean;
  /** The model the header shows. */
  active: boolean;
}

/** Rows split into the loaded group (active first) and the installed-but-not-loaded group. */
export interface SelectorGroups {
  loaded: SelectorRow[];
  ready: SelectorRow[];
}

/**
 * Splits the models into loaded and ready rows. A model is loaded when some compute holds it or it is
 * the active model (matched by base name). Loaded rows list the active model first, then by compute
 * order. Ready rows keep the order of `models`.
 */
export function selectorGroups(
  models: ModelInfo[],
  loaded: LoadedServers,
  activeModelId: string | null,
  resolved: ResolvedComputes,
): SelectorGroups {
  const activeKey = activeModelId === null ? null : shortModelKey(activeModelId);
  const rows = models.map((model): SelectorRow => {
    const active = activeKey === shortModelKey(model.name);
    const compute = computeHoldingModel(loaded, model.name);
    if (compute !== null || active) {
      return {
        model,
        compute,
        device: compute === null ? null : (loaded[compute]?.device ?? null),
        loaded: true,
        active,
      };
    }
    return { model, compute: resolved[model.name] ?? null, device: null, loaded: false, active };
  });
  return {
    loaded: rows.filter((row) => row.loaded).sort((a, b) => loadedRank(a) - loadedRank(b)),
    ready: rows.filter((row) => !row.loaded),
  };
}

/** Sort key for a loaded row: the active one first, then compute order, unknown computes last. */
function loadedRank(row: SelectorRow): number {
  if (row.active) return -1;
  if (row.compute === null) return COMPUTE_PORT_TARGETS.length;
  return COMPUTE_PORT_TARGETS.indexOf(row.compute);
}

/**
 * The status text of a row: "Active · NPU", "Loaded on NPU", "Runs on NPU" for a model not loaded yet.
 * The compute part is left out when it is unknown. Null for a ready row whose compute is not known.
 */
export function rowStatusText(row: SelectorRow): string | null {
  const where = row.compute === null ? null : COMPUTE_PORT_LABELS[row.compute];
  if (row.active) return where === null ? "Active" : `Active · ${where}`;
  if (row.loaded) return where === null ? "Loaded" : `Loaded on ${where}`;
  return where === null ? null : `Runs on ${where}`;
}

/** The header's "+N loaded": the loaded models besides the active one. Null when there are none. */
export function extraLoadedLabel(loadedCount: number): string | null {
  return loadedCount > 1 ? `+${loadedCount - 1} loaded` : null;
}

/** The server a compute holds, or null when the compute is unknown or empty. */
export function occupantOf(
  loaded: LoadedServers,
  compute: ComputeTarget | null,
): LoadedServer | null {
  if (compute === null) return null;
  return loaded[compute] ?? null;
}

/** Text of the confirmation shown before a load unloads the model on its compute. */
export function replacementText(modelName: string, occupant: LoadedServer | null): string {
  const key = shortModelKey(modelName);
  if (occupant === null) return `Loading ${key} unloads the model on its compute.`;
  const label = COMPUTE_PORT_LABELS[occupant.compute];
  return `${label} runs ${shortModelKey(occupant.model)}. Loading ${key} on ${label} unloads it.`;
}

/**
 * RAM the model on `compute` gives back when it is unloaded for another model. Zero when nothing
 * holds the compute, the figures are unknown, or the occupant is not in `models`.
 */
export function replacedRamBytes(
  snapshot: RamSnapshot | null,
  models: ModelInfo[],
  loaded: LoadedServers,
  compute: ComputeTarget | null,
): number {
  const occupant = occupantOf(loaded, compute);
  if (snapshot === null || occupant === null) return 0;
  const model = models.find((m) => shortModelKey(m.name) === shortModelKey(occupant.model));
  return model ? estimatedRamBytes(snapshot, model) : 0;
}
