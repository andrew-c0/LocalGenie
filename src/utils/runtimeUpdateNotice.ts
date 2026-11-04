import type { RuntimeInfo, RuntimeUpdateInfo } from "../types";

/** How often the update checks run while the app is open. The Rust side caches release lookups for an hour. */
export const RUNTIME_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** An installed runtime with an update that has not been notified yet. */
export interface PendingRuntimeUpdate {
  id: string;
  name: string;
  installed: string;
  latest: string;
}

/**
 * The updates to notify: installed runtimes whose latest release is newer than the installed one, and
 * whose latest version differs from the one already notified. Runtimes that were never checked, or whose
 * last check failed, have no entry in `updatesById` and are skipped.
 */
export function updatesToNotify(
  runtimes: RuntimeInfo[],
  updatesById: Record<string, RuntimeUpdateInfo>,
  notified: Record<string, string>,
): PendingRuntimeUpdate[] {
  const pending: PendingRuntimeUpdate[] = [];
  for (const runtime of runtimes) {
    const update = updatesById[runtime.id];
    if (runtime.installedVersion === null || !update?.updateAvailable) continue;
    if (notified[runtime.id] === update.latestVersion) continue;
    pending.push({
      id: runtime.id,
      name: runtime.displayName,
      installed: runtime.installedVersion,
      latest: update.latestVersion,
    });
  }
  return pending;
}

const SETTINGS_HINT = "Open Settings > Runtimes to update.";

/** The notification title and body for the pending updates. Call it only with at least one update. */
export function noticeText(updates: PendingRuntimeUpdate[]): { title: string; body: string } {
  const [only] = updates;
  if (updates.length === 1 && only) {
    return {
      title: `${only.name} ${only.latest} is available`,
      body: `Installed ${only.installed}. ${SETTINGS_HINT}`,
    };
  }
  const names = updates.map((update) => `${update.name} ${update.latest}`).join(", ");
  return {
    title: `${updates.length} runtime updates are available`,
    body: `${names}. ${SETTINGS_HINT}`,
  };
}
