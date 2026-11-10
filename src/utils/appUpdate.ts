import type { AppUpdateDownloadEvent, AppUpdateProgress } from "../types";
import { formatBytes } from "./format";

/** A check runs when the last one is this old. The app checks at start, then on this rhythm while it runs. */
export const APP_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** How often the timer looks at the last check time. Hourly, so a due check is at most an hour late. */
export const APP_UPDATE_TICK_MS = 60 * 60 * 1000;

/** The first check runs this long after start, so startup is not slowed down. */
export const APP_UPDATE_START_DELAY_MS = 10 * 1000;

/** Preference key: the app version a notification was already sent for. */
export const NOTIFIED_APP_UPDATE_KEY = "notified_app_update";

/** Release notes longer than this are cut at a line break. */
const RELEASE_NOTES_LIMIT = 1500;

/** True when no check has run yet, or the last one is at least the interval old (or in the future, after a clock change). */
export function shouldCheckNow(lastCheckedAt: number | null, now: number): boolean {
  if (lastCheckedAt === null) return true;
  const elapsed = now - lastCheckedAt;
  return elapsed < 0 || elapsed >= APP_UPDATE_CHECK_INTERVAL_MS;
}

/** True when the version is a real one and differs from the version already notified. */
export function shouldNotify(version: string, notifiedVersion: string | null): boolean {
  return version.trim() !== "" && version !== notifiedVersion;
}

/** The notified version from the stored value. Anything that is not a non-empty text reads as nothing notified. */
export function resolveNotifiedAppVersion(stored: unknown): string | null {
  return typeof stored === "string" && stored.trim() !== "" ? stored : null;
}

/** Download progress as a fraction from 0 to 1, or null while the total size is not known. */
export function downloadFraction(
  downloadedBytes: number,
  totalBytes: number | null,
): number | null {
  if (totalBytes === null || totalBytes <= 0) return null;
  return Math.min(1, Math.max(0, downloadedBytes / totalBytes));
}

/** Progress before any download event. */
export const EMPTY_DOWNLOAD_PROGRESS: AppUpdateProgress = {
  downloadedBytes: 0,
  totalBytes: null,
  fraction: null,
};

/** The progress after one download event: a start sets the total, each chunk adds bytes, the end reads as complete. */
export function applyDownloadEvent(
  progress: AppUpdateProgress,
  event: AppUpdateDownloadEvent,
): AppUpdateProgress {
  switch (event.kind) {
    case "started":
      return {
        downloadedBytes: 0,
        totalBytes: event.contentLength,
        fraction: downloadFraction(0, event.contentLength),
      };
    case "progress": {
      const downloadedBytes = progress.downloadedBytes + event.chunkLength;
      return {
        downloadedBytes,
        totalBytes: progress.totalBytes,
        fraction: downloadFraction(downloadedBytes, progress.totalBytes),
      };
    }
    case "finished":
      return { ...progress, fraction: 1 };
  }
}

/** One line for the download bytes: "Downloaded 12 MB of 45 MB", or without the total when it is unknown. */
export function progressLabel(progress: AppUpdateProgress): string {
  const done = formatBytes(progress.downloadedBytes);
  if (progress.totalBytes === null) return `Downloaded ${done}`;
  return `Downloaded ${done} of ${formatBytes(progress.totalBytes)}`;
}

/** Release notes ready to show: line breaks normalised, trimmed, and cut at a line break past the limit. */
export function trimReleaseNotes(
  notes: string | null | undefined,
  limit = RELEASE_NOTES_LIMIT,
): string {
  const text = (notes ?? "").replace(/\r\n?/g, "\n").trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastBreak = cut.lastIndexOf("\n");
  const kept = lastBreak > limit / 2 ? cut.slice(0, lastBreak) : cut;
  return `${kept.trimEnd()}...`;
}

/** The desktop notice for a new app version. */
export function appUpdateNoticeText(
  version: string,
  currentVersion: string,
): { title: string; body: string } {
  return {
    title: `LocalGenie ${version} is available`,
    body: `You have ${currentVersion}. Open Settings > Application & Runtime to download and restart.`,
  };
}

/** The line under the Check for updates button: when the last check ran. */
export function lastCheckedLabel(lastCheckedAt: number | null): string {
  if (lastCheckedAt === null) return "Not checked yet";
  return `Last checked ${new Date(lastCheckedAt).toLocaleString()}`;
}
