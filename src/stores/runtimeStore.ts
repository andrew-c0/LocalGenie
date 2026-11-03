import { create } from "zustand";
import { checkRuntimeUpdate, listRuntimes } from "../services/runtimes";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../types";
import { errorMessage } from "../utils/errorMessage";
import { GENIEX_RUNTIME_ID } from "../utils/runtimeSpecifics";
import { useModelStore } from "./modelStore";

interface RuntimeState {
  /** Every runtime the app knows, with its installed version. Null until the first read. */
  runtimes: RuntimeInfo[] | null;
  /** Why the last read failed, or null. The next good read clears it. */
  readError: string | null;
  /** Latest release and installed version by runtime id, from the last `checkUpdates`. A runtime whose check failed has no entry. */
  updatesById: Record<string, RuntimeUpdateInfo>;
  /**
   * Reads the list again. A failed read keeps what is known. When the list is unchanged it keeps its
   * identity, so nothing that follows the list (such as the update checks) runs again for nothing.
   * The read also sets `modelStore.cliInstalled`, from the GenieX entry.
   */
  refresh: () => Promise<void>;
  /** Checks every runtime's latest release. Calls GitHub, so it runs when the list changes, not on a timer. */
  checkUpdates: () => Promise<void>;
  /** Ids of the runtimes being uninstalled now. An uninstall runs from the runtime's card, not the drawer. */
  removingIds: string[];
  beginRemoving: (runtimeId: string) => void;
  endRemoving: (runtimeId: string) => void;
}

/** Ids of the installed runtimes. Null until the first read, so nothing is locked while unknown. */
export function installedRuntimeIds(runtimes: RuntimeInfo[] | null): string[] | null {
  return runtimes?.filter((r) => r.installedVersion !== null).map((r) => r.id) ?? null;
}

/** Whether the GenieX CLI is listed as installed. */
function isGeniexInstalled(runtimes: RuntimeInfo[]): boolean {
  return runtimes.some((r) => r.id === GENIEX_RUNTIME_ID && r.installedVersion !== null);
}

/** The update checks that succeeded, keyed by runtime id. */
function successfulUpdates(
  checks: PromiseSettledResult<RuntimeUpdateInfo>[],
): Record<string, RuntimeUpdateInfo> {
  const entries = checks.flatMap((check): [string, RuntimeUpdateInfo][] =>
    check.status === "fulfilled" ? [[check.value.id, check.value]] : [],
  );
  return Object.fromEntries(entries);
}

/**
 * The runtime list shared by Settings > Runtimes, the feature locks and the Downloads drawer. An
 * install or uninstall, wherever it runs, calls `refresh`, so every reader follows it.
 */
export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  runtimes: null,
  readError: null,
  updatesById: {},
  removingIds: [],
  beginRemoving: (runtimeId) =>
    set((state) =>
      state.removingIds.includes(runtimeId)
        ? state
        : { removingIds: [...state.removingIds, runtimeId] },
    ),
  endRemoving: (runtimeId) =>
    set((state) => ({ removingIds: state.removingIds.filter((id) => id !== runtimeId) })),
  refresh: async () => {
    try {
      const list = await listRuntimes();
      const current = get().runtimes;
      // The list is small, and the backend writes it in a fixed order, so comparing the JSON is enough.
      const unchanged = current !== null && JSON.stringify(current) === JSON.stringify(list);
      set({ runtimes: unchanged ? current : list, readError: null });
      useModelStore.getState().setCliInstalled(isGeniexInstalled(list));
    } catch (err) {
      console.warn("[runtimes] Could not read the runtimes:", err);
      set({ readError: errorMessage(err, "Could not read the runtimes.") });
    }
  },
  checkUpdates: async () => {
    const runtimes = get().runtimes ?? [];
    const checks = await Promise.allSettled(runtimes.map((r) => checkRuntimeUpdate(r.id)));
    set({ updatesById: successfulUpdates(checks) });
  },
}));
