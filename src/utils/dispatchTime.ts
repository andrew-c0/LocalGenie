import type { DispatchStatus } from "../types";
import { isWorking } from "./dispatchTask";
import { formatRelativeDate } from "./format";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** The fields of a conversation the elapsed time reads from. */
export interface TurnTimes {
  status: DispatchStatus;
  startedAt: number | null;
  finishedAt: number | null;
}

/**
 * Wall-clock time the current turn has run: from its start to now while it works, else from its start to
 * its end. Null before any turn started. Never negative.
 */
export function elapsedMsOf(task: TurnTimes, now: number): number | null {
  if (task.startedAt === null) return null;
  const end = isWorking(task.status) ? now : (task.finishedAt ?? now);
  return Math.max(0, end - task.startedAt);
}

/** A duration as `45s`, `3m 12s` or `1h 5m`. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  if (totalSeconds < 3600) {
    return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
  }
  return `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`;
}

/**
 * How long ago a moment was, for a list: `just now`, `5 min ago`, `3 h ago`, then the day count from
 * `formatRelativeDate`. A moment in the future counts as just now.
 */
export function ageLabel(at: number, now: number): string {
  const ago = now - at;
  if (ago < MINUTE_MS) return "just now";
  if (ago < HOUR_MS) return `${Math.floor(ago / MINUTE_MS)} min ago`;
  if (ago < DAY_MS) return `${Math.floor(ago / HOUR_MS)} h ago`;
  return formatRelativeDate(at, now) ?? "";
}
