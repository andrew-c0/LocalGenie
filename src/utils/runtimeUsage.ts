import * as geniex from "../services/geniex";
import { useModelStore } from "../stores/modelStore";
import { useRuntimeStore } from "../stores/runtimeStore";
import { GENIEX_RUNTIME_ID } from "./runtimeSpecifics";

/**
 * Re-reads the model library. It comes from the local database, so it is read with or without the GenieX
 * CLI (without it the sizes read "—"). Best-effort: a failed list keeps what is shown.
 */
export async function refreshModelList(): Promise<void> {
  try {
    useModelStore.getState().setModels(await geniex.listModels());
  } catch {
    // CLI list refresh is best-effort
  }
}

/** The state each runtime keeps beyond the runtime list, by runtime id. A runtime with none has no entry. */
const USAGE_SYNC: Partial<Record<string, () => Promise<void>>> = {
  [GENIEX_RUNTIME_ID]: refreshModelList,
};

/**
 * Re-reads the runtime list, then the usage state of the runtime it names. Runs after every install,
 * update or uninstall, whether it succeeded or failed, and from a runtime's "Check again".
 */
export async function refreshAfterRuntimeChange(runtimeId: string): Promise<void> {
  await useRuntimeStore.getState().refresh();
  await USAGE_SYNC[runtimeId]?.();
}
