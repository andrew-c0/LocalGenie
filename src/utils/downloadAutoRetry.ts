import type { DownloadItem, DownloadStatus } from "../stores/downloadStore";
import { classifyFailureText } from "./networkError";

/** Automatic retries one failure episode may use before the entry stays failed. */
export const MAX_AUTO_RETRIES = 3;

/** Delay before the first automatic retry of a failure while online. Each later one waits `RETRY_GROWTH` times longer. */
const FIRST_RETRY_MS = 5_000;
const RETRY_GROWTH = 3;

/** Gap between the starts of the retries a reconnect triggers, so they do not all start in one tick. */
const RECONNECT_SPACING_MS = 1_000;

/** Statuses of an entry that runs (or waits to run) again. */
const RUNNING_STATUSES: readonly DownloadStatus[] = ["queued", "downloading", "importing"];

/** Who starts a run again: the user (Retry, Resume or a new request) or the automatic retry. */
export type RetryTrigger = "manual" | "automatic";

/** What the drawer shows of an entry that retries by itself. */
export type AutoRetryNotice =
  | { kind: "offline" }
  | { kind: "scheduled"; retryAt: number; attempt: number }
  | { kind: "running"; attempt: number }
  | { kind: "exhausted" };

/** Automatic retries the entry has used in its current failure episode. */
export function autoRetriesUsed(item: Pick<DownloadItem, "autoRetries">): number {
  return item.autoRetries ?? 0;
}

/**
 * True when a failure is a transient network one, worth an automatic retry: the request never reached
 * the service (offline) or it ran out of time. A bad file, a full disk, an HTTP 404 or 403, a checksum,
 * a rate limit and a cancel are not. The text decides, not the browser's connection state, so a
 * disk-full error recorded while offline stays ineligible.
 */
export function isAutoRetryEligible(item: Pick<DownloadItem, "status" | "error">): boolean {
  if (item.status !== "error" || item.error === undefined) return false;
  const kind = classifyFailureText(item.error);
  return kind === "offline" || kind === "timeout";
}

/** True while the entry still has an automatic retry left in this failure episode. */
export function hasAutoRetryBudget(item: Pick<DownloadItem, "autoRetries">): boolean {
  return autoRetriesUsed(item) < MAX_AUTO_RETRIES;
}

/** Delay before the automatic retry that follows `attemptIndex` retries already used (0 first): 5 s, 15 s, 45 s. */
export function retryDelayMs(attemptIndex: number): number {
  const index = Math.min(Math.max(attemptIndex, 0), MAX_AUTO_RETRIES - 1);
  return FIRST_RETRY_MS * RETRY_GROWTH ** index;
}

/**
 * The delay of the next automatic retry of a failed entry while online, or null when it gets none: it is
 * not eligible, or its budget is used up. While offline no timer runs at all (see `useDownloadAutoRetry`).
 */
export function failureRetryDelayMs(item: DownloadItem): number | null {
  if (!isAutoRetryEligible(item) || !hasAutoRetryBudget(item)) return null;
  return retryDelayMs(autoRetriesUsed(item));
}

/**
 * The entries a reconnect retries: every eligible one, whether its budget is used up or not. The
 * caller gives an exhausted entry a fresh budget first, so a reconnect buys one fresh budget.
 */
export function reconnectRetryItems(downloads: readonly DownloadItem[]): DownloadItem[] {
  return downloads.filter((d) => isAutoRetryEligible(d));
}

/** Start delay of the entry at `index` in a reconnect: the first at once, then one more every second. */
export function reconnectDelayMs(index: number): number {
  return index * RECONNECT_SPACING_MS;
}

/** The `autoRetries` value of a new run: a manual start begins a fresh count, an automatic one adds one. */
export function nextAutoRetries(
  previous: Pick<DownloadItem, "autoRetries"> | undefined,
  trigger: RetryTrigger,
): number {
  if (trigger === "manual") return 0;
  return (previous?.autoRetries ?? 0) + 1;
}

/** True when a run is an automatic retry, so its start needs no toast of its own (the reconnect toast or the card says it). */
export function isAutomaticRetry(item: DownloadItem | undefined): boolean {
  return (item?.autoRetries ?? 0) > 0;
}

/** True when a failed entry will run again by itself, so its failure needs no error toast of its own. */
export function willRetryAutomatically(item: DownloadItem | undefined): boolean {
  return item !== undefined && failureRetryDelayMs(item) !== null;
}

/**
 * What the drawer shows of an entry's automatic retries, or null when there is nothing to say. `online`
 * is the browser's connection state. An eligible failure waits for the connection while offline, counts
 * down while a retry is scheduled, and says it is used up once its budget is gone.
 */
export function autoRetryNoticeOf(item: DownloadItem, online: boolean): AutoRetryNotice | null {
  const used = autoRetriesUsed(item);
  if (RUNNING_STATUSES.includes(item.status)) {
    return used > 0 ? { kind: "running", attempt: used } : null;
  }
  if (!isAutoRetryEligible(item)) return null;
  if (!online) return { kind: "offline" };
  if (item.autoRetryAt !== undefined) {
    return { kind: "scheduled", retryAt: item.autoRetryAt, attempt: used + 1 };
  }
  return hasAutoRetryBudget(item) ? null : { kind: "exhausted" };
}

/** Whole seconds from `now` until `at`, never negative. */
export function secondsUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 1000));
}
