import { useEffect, useRef } from "react";
import { useDownloadStore } from "../../../stores/downloadStore";
import {
  failureRetryDelayMs,
  hasAutoRetryBudget,
  isAutoRetryEligible,
  reconnectDelayMs,
  reconnectRetryItems,
} from "../../../utils/downloadAutoRetry";
import { reconnectToastTitle } from "../../../utils/downloadAutoRetryText";
import { isBackOnline } from "../../../utils/networkError";
import { toast } from "../../../utils/toast";
import { resumeDownload } from "./resumeDownload";

/** The scheduled automatic retries, by entry id. */
type RetryTimers = Map<string, ReturnType<typeof setTimeout>>;

/** Stop an entry's scheduled retry: clear its timer and its countdown. */
function stopRetry(timers: RetryTimers, id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
  useDownloadStore.getState().setAutoRetryAt(id, undefined);
}

/** Run an entry's automatic retry in `delayMs`, and show the countdown until then. */
function scheduleRetry(timers: RetryTimers, id: string, delayMs: number): void {
  useDownloadStore.getState().setAutoRetryAt(id, Date.now() + delayMs);
  const timer = setTimeout(() => {
    timers.delete(id);
    retryIfStillDue(id);
  }, delayMs);
  timers.set(id, timer);
}

/**
 * Run the automatic retry of an entry, unless it no longer waits for one. It may have been removed,
 * cancelled or resumed by hand since the timer was set; then only its countdown is cleared.
 */
function retryIfStillDue(id: string): void {
  const store = useDownloadStore.getState();
  const item = store.downloads.find((d) => d.id === id);
  if (item && isAutoRetryEligible(item) && hasAutoRetryBudget(item)) {
    resumeDownload(item, "automatic");
    return;
  }
  store.setAutoRetryAt(id, undefined);
}

/** Going offline: no timer may run until the browser is back. */
function stopAllRetries(timers: RetryTimers): void {
  for (const id of [...timers.keys()]) stopRetry(timers, id);
}

/**
 * Coming back online: every eligible entry resumes, one second apart, and tells the user once. An
 * exhausted entry gets a fresh budget, so a reconnect buys one fresh budget per entry.
 */
function retryAllAfterReconnect(timers: RetryTimers): void {
  const items = reconnectRetryItems(useDownloadStore.getState().downloads);
  if (items.length === 0) return;
  toast.info(reconnectToastTitle(items.length));
  items.forEach((item, index) => {
    if (!hasAutoRetryBudget(item)) useDownloadStore.getState().resetAutoRetryBudget(item.id);
    scheduleRetry(timers, item.id, reconnectDelayMs(index));
  });
}

/**
 * Retries failed downloads by themselves, for network failures only (the rules are in
 * `utils/downloadAutoRetry`). A failure while online waits with backoff. A reconnect retries every
 * eligible entry one second apart. While offline no timer runs. A timer ends with its entry (removed,
 * cancelled, resumed by hand) and with the drawer's manager. The store keeps only the time of the next
 * retry, for the countdown; the timer handles stay here.
 */
export function useDownloadAutoRetry(online: boolean): void {
  const downloads = useDownloadStore((s) => s.downloads);
  const timers = useRef<RetryTimers>(new Map());
  const wasOnline = useRef(online);

  useEffect(() => {
    const cameBack = isBackOnline(wasOnline.current, online);
    wasOnline.current = online;
    if (!online) stopAllRetries(timers.current);
    else if (cameBack) retryAllAfterReconnect(timers.current);
  }, [online]);

  // A failure while online waits with backoff. Entries that already have a timer are left alone.
  useEffect(() => {
    if (!online) return;
    for (const item of downloads) {
      if (timers.current.has(item.id)) continue;
      const delayMs = failureRetryDelayMs(item);
      if (delayMs !== null) scheduleRetry(timers.current, item.id, delayMs);
    }
  }, [downloads, online]);

  // Drop the timer of an entry that no longer waits for one.
  useEffect(() => {
    for (const id of [...timers.current.keys()]) {
      const item = downloads.find((d) => d.id === id);
      if (!item || !isAutoRetryEligible(item)) stopRetry(timers.current, id);
    }
  }, [downloads]);

  // The drawer's manager ends with the app's session: no timer may fire after that.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);
}
