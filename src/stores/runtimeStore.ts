import { create } from "zustand";
import { checkRuntimeUpdate, listRuntimes } from "../services/runtimes";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../types";
import { errorMessage } from "../utils/errorMessage";
import { GENIEX_RUNTIME_ID } from "../utils/runtimeSpecifics";
import { useModelStore } from "./modelStore";

/** Where one runtime's update check stands: not run, running, done, or failed with the reason. */
export type UpdateCheckStatus = "idle" | "checking" | "ok" | "failed";

export interface UpdateCheck {
  status: UpdateCheckStatus;
  /** Why the check failed, or null. */
  error: string | null;
}

/** The check state of a runtime that has not been checked. */
export const IDLE_UPDATE_CHECK: UpdateCheck = { status: "idle", error: null };

interface RuntimeState {
  /** Every runtime the app knows, with its installed version. Null until the first read. */
  runtimes: RuntimeInfo[] | null;
  /** Why the last read failed, or null. The next good read clears it. */
  readError: string | null;
  /** Latest release and installed version by runtime id, from the last successful check. A runtime whose check failed has no entry. */
  updatesById: Record<string, RuntimeUpdateInfo>;
  /** The state of each runtime's update check, by runtime id. A runtime that was never checked has no entry. */
  updateChecks: Record<string, UpdateCheck>;
  /**
   * Reads the list again. A failed read keeps what is known. When the list is unchanged it keeps its
   * identity, so nothing that follows the list (such as the update checks) runs again for nothing.
   * The read also sets `modelStore.cliInstalled`, from the GenieX entry.
   */
  refresh: () => Promise<void>;
  /** Checks every runtime's latest release. Calls GitHub, so it runs when the list changes, not on a timer. Silent: a failure only sets the runtime's check state. */
  checkUpdates: () => Promise<void>;
  /** Checks one runtime's latest release again, for a card's "Try again". Silent, like `checkUpdates`. */
  checkUpdate: (runtimeId: string) => Promise<void>;
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

/** `record` with one runtime's entry set to `value`, or removed when `value` is undefined. */
function withEntry<T>(
  record: Record<string, T>,
  key: string,
  value: T | undefined,
): Record<string, T> {
  const next = { ...record };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/**
 * The runtime list shared by Settings > Runtimes, the feature locks and the Downloads drawer. An
 * install or uninstall, wherever it runs, calls `refresh`, so every reader follows it.
 */
export const useRuntimeStore = create<RuntimeState>((set, get) => ({
  runtimes: null,
  readError: null,
  updatesById: {},
  updateChecks: {},
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
    await Promise.all(runtimes.map((r) => get().checkUpdate(r.id)));
  },
  checkUpdate: async (runtimeId) => {
    set((state) => ({
      updateChecks: withEntry(state.updateChecks, runtimeId, { status: "checking", error: null }),
    }));
    try {
      const update = await checkRuntimeUpdate(runtimeId);
      set((state) => ({
        updatesById: withEntry(state.updatesById, runtimeId, update),
        updateChecks: withEntry(state.updateChecks, runtimeId, { status: "ok", error: null }),
      }));
    } catch (err) {
      console.warn(`[runtimes] Could not check the latest release of ${runtimeId}:`, err);
      set((state) => ({
        updatesById: withEntry(state.updatesById, runtimeId, undefined),
        updateChecks: withEntry(state.updateChecks, runtimeId, {
          status: "failed",
          error: errorMessage(err),
        }),
      }));
    }
  },
}));
