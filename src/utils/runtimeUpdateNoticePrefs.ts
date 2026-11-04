/** Preference key: whether a runtime update that is found sends a desktop notification. */
export const NOTIFY_RUNTIME_UPDATES_KEY = "notify_runtime_updates";

/** Preference key: the latest version already notified, by runtime id (a JSON object). */
export const NOTIFIED_RUNTIME_UPDATES_KEY = "notified_runtime_updates";

/** On until the user turns it off. */
export const NOTIFY_RUNTIME_UPDATES_DEFAULT = true;

/** The notify switch from the stored value. Anything that is not a boolean (missing, text, a number) counts as the default. */
export function resolveNotifyRuntimeUpdates(stored: unknown): boolean {
  return typeof stored === "boolean" ? stored : NOTIFY_RUNTIME_UPDATES_DEFAULT;
}

/**
 * The notified versions from the stored value. Only entries whose value is a non-empty text are kept;
 * anything else (a missing value, a list, a number) reads as nothing notified yet.
 */
export function resolveNotifiedRuntimeUpdates(stored: unknown): Record<string, string> {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  const versions: Record<string, string> = {};
  for (const [runtimeId, version] of Object.entries(stored)) {
    if (typeof version === "string" && version.trim() !== "") versions[runtimeId] = version;
  }
  return versions;
}
