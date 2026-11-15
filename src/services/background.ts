import { invoke } from "@tauri-apps/api/core";
import type { BackgroundSettings } from "../types";
import { listenEvent } from "./events";

/** The event the tray's Exit item sends. The window is shown first; the frontend decides whether to quit. */
export const EXIT_REQUESTED_EVENT = "exit-requested";

/** The saved background settings. */
export async function getBackgroundSettings(): Promise<BackgroundSettings> {
  return invoke("background_settings_get");
}

/** Turns keeping the app in the tray on or off. Off makes closing the window quit the app. */
export async function setKeepRunningInTray(enabled: boolean): Promise<void> {
  await invoke("background_keep_running_in_tray_set", { enabled });
}

/** Turns starting LocalGenie with Windows on or off. Rejects with a readable message when it fails. */
export async function setStartWithWindows(enabled: boolean): Promise<void> {
  await invoke("background_start_with_windows_set", { enabled });
}

/** Quits the app after cleanup. */
export async function exitApp(): Promise<void> {
  await invoke("app_exit");
}

/** Calls `handler` when the tray's Exit item is chosen. Resolves to the function that stops listening. */
export function onExitRequested(handler: () => void): Promise<() => void> {
  return listenEvent<null>(EXIT_REQUESTED_EVENT, () => handler());
}
