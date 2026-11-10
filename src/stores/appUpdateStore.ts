import { create } from "zustand";
import {
  checkForAppUpdate,
  downloadAndInstallAppUpdate,
  getNotifiedAppVersion,
  relaunchApp,
  saveNotifiedAppVersion,
} from "../services/appUpdate";
import type { AppUpdateInfo, AppUpdateProgress } from "../types";
import { applyDownloadEvent, EMPTY_DOWNLOAD_PROGRESS } from "../utils/appUpdate";

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "error"
  | "upToDate";

/** Which step failed: the check for a new version, or its download and install. */
export type AppUpdateErrorAction = "check" | "install";

interface AppUpdateState {
  status: AppUpdateStatus;
  /** The newest version the feed announced. Kept after a failed check; cleared when a check finds none. */
  update: AppUpdateInfo | null;
  progress: AppUpdateProgress;
  /** When the last check attempt ended, success or failure. Null before the first one. */
  lastCheckedAt: number | null;
  /** The failure as the service reported it (an AppUpdateError). Kept for the message and the console. */
  error: unknown;
  errorAction: AppUpdateErrorAction | null;
  /** The version a desktop notification was already sent for, kept between runs. */
  notifiedVersion: string | null;
  /** True once the saved notified version has been read. Nothing is notified before that. */
  notifiedLoaded: boolean;
  /** Reads the saved notified version once at startup. A failed read leaves nothing loaded, so nothing is notified. */
  loadNotifiedVersion: () => Promise<void>;
  /** Checks the feed for a newer version. Does nothing while a check, download or install is running. */
  checkNow: () => Promise<void>;
  /** Downloads and installs the announced update, then restarts. Does nothing while busy or without an update. */
  installUpdate: () => Promise<void>;
  /** Records the version a notification was sent for, so the same version is not announced again. */
  recordNotified: (version: string) => void;
}

const BUSY_STATUSES: AppUpdateStatus[] = ["checking", "downloading", "installing"];

/** App update state: the newest version, the download progress and the notified version. */
export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
  status: "idle",
  update: null,
  progress: EMPTY_DOWNLOAD_PROGRESS,
  lastCheckedAt: null,
  error: null,
  errorAction: null,
  notifiedVersion: null,
  notifiedLoaded: false,

  loadNotifiedVersion: async () => {
    try {
      const notifiedVersion = await getNotifiedAppVersion();
      set({ notifiedVersion, notifiedLoaded: true });
    } catch (err) {
      console.warn("[app-update] Saved notified version unavailable:", err);
    }
  },

  checkNow: async () => {
    if (BUSY_STATUSES.includes(get().status)) return;
    set({ status: "checking" });
    try {
      const found = await checkForAppUpdate();
      set({
        status: found ? "available" : "upToDate",
        update: found,
        lastCheckedAt: Date.now(),
        error: null,
        errorAction: null,
      });
    } catch (err) {
      console.warn("[app-update] Update check failed:", err);
      set({ status: "error", error: err, errorAction: "check", lastCheckedAt: Date.now() });
    }
  },

  installUpdate: async () => {
    if (!get().update || BUSY_STATUSES.includes(get().status)) return;
    set({
      status: "downloading",
      progress: EMPTY_DOWNLOAD_PROGRESS,
      error: null,
      errorAction: null,
    });
    try {
      await downloadAndInstallAppUpdate((event) => {
        set((state) => ({
          progress: applyDownloadEvent(state.progress, event),
          status: event.kind === "finished" ? "installing" : state.status,
        }));
      });
      set({ status: "installing" });
      // On Windows the installer has already closed the app; this only matters when it did not.
      await relaunchApp().catch((err: unknown) =>
        console.warn("[app-update] Restart did not start:", err),
      );
    } catch (err) {
      console.warn("[app-update] Update install failed:", err);
      set({ status: "error", error: err, errorAction: "install" });
    }
  },

  recordNotified: (version) => {
    set({ notifiedVersion: version });
    saveNotifiedAppVersion(version).catch((err: unknown) =>
      console.warn("[app-update] Could not save the notified version:", err),
    );
  },
}));
