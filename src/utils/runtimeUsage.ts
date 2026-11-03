import * as geniex from "../services/geniex";
import { useModelStore } from "../stores/modelStore";
import { useRuntimeStore } from "../stores/runtimeStore";
import { GENIEX_RUNTIME_ID } from "./runtimeSpecifics";

/** Refreshes the GenieX CLI's model library. Best-effort: a failed list keeps what is shown. */
export async function refreshModelList(): Promise<void> {
  try {
    useModelStore.getState().setModels(await geniex.listModels());
  } catch {
    // CLI list refresh is best-effort
  }
}

/** The GenieX CLI's model library: it lists what the CLI can load, so it empties when the CLI is gone. */
async function syncGeniexModels(): Promise<void> {
  if (useModelStore.getState().cliInstalled) await refreshModelList();
  else useModelStore.getState().setModels([]);
}

/** The state each runtime keeps beyond the runtime list, by runtime id. A runtime with none has no entry. */
const USAGE_SYNC: Partial<Record<string, () => Promise<void>>> = {
  [GENIEX_RUNTIME_ID]: syncGeniexModels,
};

/**
 * Re-reads the runtime list, then the usage state of the runtime it names. Runs after every install,
 * update or uninstall, whether it succeeded or failed, and from a runtime's "Check again". The list
 * sets `cliInstalled`, so the usage sync reads the current state.
 */
export async function refreshAfterRuntimeChange(runtimeId: string): Promise<void> {
  await useRuntimeStore.getState().refresh();
  await USAGE_SYNC[runtimeId]?.();
}
