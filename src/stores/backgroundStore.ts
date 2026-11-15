import { create } from "zustand";
import {
  getBackgroundSettings,
  setKeepRunningInTray,
  setStartWithWindows,
} from "../services/background";
import type { BackgroundSettings } from "../types";
import { errorMessage } from "../utils/errorMessage";
import { toast } from "../utils/toast";

type BackgroundSettingKey = keyof BackgroundSettings;

interface BackgroundState {
  /** The saved background settings. Null until the first read, so the switches stay disabled. */
  settings: BackgroundSettings | null;
  /** The raw error of a failed first read, kept for the card. Null when the read worked or has not run. */
  loadError: unknown;
  /** Saves still waiting for the backend. The switches stay disabled while this is above zero. */
  pendingSaves: number;
  /** Reads the settings once at startup. A failed read leaves them null, so the switches stay disabled. */
  load: () => Promise<void>;
  /** Keeps the app in the tray on or off. Shows the change at once and rolls it back if the save fails. */
  setKeepRunningInTray: (enabled: boolean) => Promise<void>;
  /** Starts the app with Windows on or off. Shows the change at once and rolls it back if the save fails. */
  setStartWithWindows: (enabled: boolean) => Promise<void>;
}

/** Background settings: keep running in the tray, and start with Windows. */
export const useBackgroundStore = create<BackgroundState>((set, get) => {
  /** Applies one switch at once, saves it, and rolls it back with a toast when the save fails. */
  const saveSetting = async (
    key: BackgroundSettingKey,
    enabled: boolean,
    write: (value: boolean) => Promise<void>,
    failureTitle: string,
  ): Promise<void> => {
    const previous = get().settings;
    if (!previous) return;
    const previousValue = previous[key];
    set((state) => ({
      settings: state.settings && { ...state.settings, [key]: enabled },
      pendingSaves: state.pendingSaves + 1,
    }));
    try {
      await write(enabled);
    } catch (err) {
      set((state) => ({
        settings: state.settings && { ...state.settings, [key]: previousValue },
      }));
      toast.error(failureTitle, errorMessage(err));
    } finally {
      set((state) => ({ pendingSaves: state.pendingSaves - 1 }));
    }
  };

  return {
    settings: null,
    loadError: null,
    pendingSaves: 0,

    load: async () => {
      try {
        const settings = await getBackgroundSettings();
        set({ settings, loadError: null });
      } catch (err) {
        console.warn("[background] Background settings unavailable:", err);
        set({ loadError: err });
      }
    },

    setKeepRunningInTray: (enabled) =>
      saveSetting(
        "keepRunningInTray",
        enabled,
        setKeepRunningInTray,
        "Could not change keeping LocalGenie in the tray",
      ),

    setStartWithWindows: (enabled) =>
      saveSetting(
        "startWithWindows",
        enabled,
        setStartWithWindows,
        "Could not change starting with Windows",
      ),
  };
});
