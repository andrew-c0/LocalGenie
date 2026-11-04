import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/**
 * Shows a desktop notification. Asks for permission first when it is not granted yet. Resolves to true
 * when the notification was sent, and to false when permission is denied or anything fails. Never throws.
 */
export async function notify(title: string, body: string): Promise<boolean> {
  try {
    const granted = (await isPermissionGranted()) || (await requestPermission()) === "granted";
    if (!granted) return false;
    sendNotification({ title, body });
    return true;
  } catch (err) {
    console.warn("[notifications] Could not show a notification:", err);
    return false;
  }
}
