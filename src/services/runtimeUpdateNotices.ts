import {
  NOTIFIED_RUNTIME_UPDATES_KEY,
  NOTIFY_RUNTIME_UPDATES_KEY,
  resolveNotifiedRuntimeUpdates,
  resolveNotifyRuntimeUpdates,
} from "../utils/runtimeUpdateNoticePrefs";
import * as db from "./database";

/** The saved switch for runtime update notifications. On when nothing valid is stored. */
export async function getNotifyRuntimeUpdates(): Promise<boolean> {
  const stored = await db.getPreference<boolean>(NOTIFY_RUNTIME_UPDATES_KEY).catch(() => null);
  return resolveNotifyRuntimeUpdates(stored);
}

/** Saves the runtime update notification switch. */
export async function saveNotifyRuntimeUpdates(enabled: boolean): Promise<void> {
  await db.setPreference(NOTIFY_RUNTIME_UPDATES_KEY, enabled, "boolean");
}

/**
 * The latest version notified for each runtime. Rejects when the stored value cannot be read, so the
 * caller does not notify again for versions it cannot confirm as sent.
 */
export async function getNotifiedRuntimeUpdates(): Promise<Record<string, string>> {
  const stored = await db.getPreference<Record<string, string>>(NOTIFIED_RUNTIME_UPDATES_KEY);
  return resolveNotifiedRuntimeUpdates(stored);
}

/** Saves the latest version notified for each runtime. */
export async function saveNotifiedRuntimeUpdates(versions: Record<string, string>): Promise<void> {
  await db.setPreference(NOTIFIED_RUNTIME_UPDATES_KEY, versions, "json");
}
