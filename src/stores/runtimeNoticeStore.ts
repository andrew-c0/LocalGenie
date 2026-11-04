import { create } from "zustand";
import {
  getNotifiedRuntimeUpdates,
  getNotifyRuntimeUpdates,
  saveNotifiedRuntimeUpdates,
  saveNotifyRuntimeUpdates,
} from "../services/runtimeUpdateNotices";

interface RuntimeNoticeState {
  /** Whether runtime update notifications are on. Null until the saved value is read. */
  notifyEnabled: boolean | null;
  /** The latest version notified for each runtime id. Null until read, so nothing is sent before then. */
  notifiedVersions: Record<string, string> | null;
  /** Reads both saved values once at startup. A failed read leaves the value null, so nothing is sent. */
  load: () => Promise<void>;
  /** Turns the notifications on or off. The change applies at once and is saved for the next run. */
  setNotifyEnabled: (enabled: boolean) => void;
  /** Records versions that were notified, so the same version is not notified again. Call it only after a notification was sent. */
  recordNotified: (versions: { id: string; latest: string }[]) => void;
}

/** Runtime update notification state: the switch and the versions already notified, both kept between runs. */
export const useRuntimeNoticeStore = create<RuntimeNoticeState>((set, get) => ({
  notifyEnabled: null,
  notifiedVersions: null,
  load: async () => {
    try {
      const notifyEnabled = await getNotifyRuntimeUpdates();
      set({ notifyEnabled });
      const notifiedVersions = await getNotifiedRuntimeUpdates();
      set({ notifiedVersions });
    } catch (err) {
      console.warn("[runtime-notices] Saved notification state unavailable:", err);
    }
  },
  setNotifyEnabled: (enabled) => {
    set({ notifyEnabled: enabled });
    saveNotifyRuntimeUpdates(enabled).catch((err: unknown) =>
      console.warn("[runtime-notices] Could not save the notification switch:", err),
    );
  },
  recordNotified: (versions) => {
    const current = get().notifiedVersions ?? {};
    const next = { ...current };
    for (const { id, latest } of versions) next[id] = latest;
    set({ notifiedVersions: next });
    saveNotifiedRuntimeUpdates(next).catch((err: unknown) =>
      console.warn("[runtime-notices] Could not save the notified versions:", err),
    );
  },
}));
