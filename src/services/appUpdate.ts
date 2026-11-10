import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import type { AppUpdateDownloadEvent, AppUpdateInfo } from "../types";
import { NOTIFIED_APP_UPDATE_KEY, resolveNotifiedAppVersion } from "../utils/appUpdate";
import { errorMessage } from "../utils/errorMessage";
import { classifyNetworkError, type NetworkErrorKind } from "../utils/networkError";
import { getPreference, setPreference } from "./database";

/**
 * A failed app update step. The message is the plain text of the cause; `kind` says whether the
 * network was the cause, so the screen can show the offline or rate-limit wording.
 */
export class AppUpdateError extends Error {
  readonly kind: NetworkErrorKind;

  constructor(cause: unknown) {
    super(errorMessage(cause, "The app update failed."));
    this.name = "AppUpdateError";
    this.kind = classifyNetworkError(cause);
  }
}

/** The update the last check found. It holds a resource on the Rust side, so it is closed when a newer check replaces it. */
let pendingUpdate: Update | null = null;

/** Asks the update feed for a newer version. Resolves to its details, or null when this version is the newest. */
export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  let found: Update | null;
  try {
    found = await check();
  } catch (err) {
    throw new AppUpdateError(err);
  }
  const previous = pendingUpdate;
  pendingUpdate = found;
  if (previous && previous !== found) await previous.close().catch(() => undefined);
  if (!found) return null;
  return {
    version: found.version,
    currentVersion: found.currentVersion,
    notes: found.body ?? null,
    date: found.date ?? null,
  };
}

/**
 * Downloads and installs the update the last check found. `onProgress` gets each download step. On
 * Windows the installer closes the app when it starts, so the caller treats a relaunch as best effort.
 */
export async function downloadAndInstallAppUpdate(
  onProgress: (event: AppUpdateDownloadEvent) => void,
): Promise<void> {
  const update = pendingUpdate;
  if (!update) throw new AppUpdateError("No update is waiting to be installed. Check again.");
  try {
    await update.downloadAndInstall((event) => onProgress(toDownloadEvent(event)));
  } catch (err) {
    throw new AppUpdateError(err);
  }
}

function toDownloadEvent(event: DownloadEvent): AppUpdateDownloadEvent {
  switch (event.event) {
    case "Started":
      return { kind: "started", contentLength: event.data.contentLength ?? null };
    case "Progress":
      return { kind: "progress", chunkLength: event.data.chunkLength };
    case "Finished":
      return { kind: "finished" };
  }
}

/** Restarts the app. Best effort: the caller decides what to show when it fails. */
export async function relaunchApp(): Promise<void> {
  await relaunch();
}

/** The version a notification was already sent for, or null. */
export async function getNotifiedAppVersion(): Promise<string | null> {
  return resolveNotifiedAppVersion(await getPreference<string>(NOTIFIED_APP_UPDATE_KEY));
}

/** Saves the version a notification was sent for. */
export async function saveNotifiedAppVersion(version: string): Promise<void> {
  await setPreference(NOTIFIED_APP_UPDATE_KEY, version, "string");
}
