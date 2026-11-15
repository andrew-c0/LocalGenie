import { invoke } from "@tauri-apps/api/core";

/**
 * Sets the tray icon's tooltip. Null or empty resets it to the app name. A tooltip is never worth a toast,
 * so a failure is only logged.
 */
export async function setTrayTooltip(text: string | null): Promise<void> {
  try {
    await invoke("tray_set_tooltip", { text });
  } catch (err) {
    console.warn("[trayStatus] Could not set the tray tooltip:", err);
  }
}

/**
 * Shows a Windows notification only while the main window is hidden or minimized. Resolves to true when
 * it was shown. Never throws.
 */
export async function notifyIfHidden(title: string, body: string): Promise<boolean> {
  try {
    return await invoke<boolean>("notify_if_hidden", { title, body });
  } catch (err) {
    console.warn("[trayStatus] Could not show a notification:", err);
    return false;
  }
}
