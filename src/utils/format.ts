/** Shared formatting helpers used across pages and components. */

/** Short display name from a repo id like `org/model:precision`. */
export function shortName(id: string): string {
  return id.split("/").pop() ?? id;
}

/** Compact count: 1.2M / 3.4K / raw. */
export function formatCount(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** A count with its noun, for example "1 run" or "3 runs". Plural for zero and for more than one. */
export function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** A whole number with thousands separators, for example `40,960`. `—` when unknown. */
export function formatWhole(n?: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

/** Compact byte size with units. */
export function formatBytes(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

/** Time left for `remaining` bytes at `speed` bytes per second: `45s`, `3m 4s`, `1h 2m`. Dash when unknown. */
export function formatEta(remaining: number, speed: number): string {
  if (speed <= 0 || remaining <= 0) return "—";
  const s = Math.round(remaining / speed);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/**
 * A transfer's rate line: `1.2 MB/s · ETA 3m 4s`. With no known size (`remaining` null) only the speed
 * shows, since a time left cannot be worked out.
 */
export function rateLabel(speed: number, remaining: number | null): string {
  const rate = `${formatBytes(speed)}/s`;
  return remaining === null ? rate : `${rate} · ETA ${formatEta(remaining, speed)}`;
}

/** Context length for a card: `8K`, `128K`, or the raw count below 1K. Null when unknown. */
export function formatContextLength(tokens: number | null | undefined): string | null {
  if (!tokens) return null;
  if (tokens < 1024) return `${tokens}`;
  return `${Math.round(tokens / 1024)}K`;
}

/** Gigabytes with one decimal, for example `16.3 GB`. `—` when unknown. */
export function formatGigabytes(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n / 1_073_741_824).toFixed(1)} GB`;
}

const DAY_MS = 86_400_000;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/**
 * How long ago a date was, as short text: `today`, `3 days ago`, `2 weeks ago`,
 * `5 months ago`, `2 years ago`. Takes an ISO string or epoch milliseconds. A future date counts as
 * today. Null when the date is missing or invalid.
 */
export function formatRelativeDate(
  value: string | number | null | undefined,
  now: number = Date.now(),
): string | null {
  const then = typeof value === "number" ? value : Date.parse(value ?? "");
  if (Number.isNaN(then)) return null;
  const days = Math.floor(Math.max(0, now - then) / DAY_MS);
  if (days < 1) return "today";
  if (days < 7) return plural(days, "day");
  if (days < 30) return plural(Math.floor(days / 7), "week");
  const months = Math.floor(days / 30);
  if (months < 12) return plural(months, "month");
  return plural(Math.max(1, Math.floor(days / 365)), "year");
}

/** An ISO date as a day in the user's locale, for example `Apr 28, 2025`. Null when missing or invalid. */
export function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return then.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Full date and time of an ISO date for a tooltip, in the user's locale. Null when missing or invalid. */
export function formatFullDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return then.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Duration as `850ms` or `1.4s`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Tokens/sec from a token count and elapsed ms. */
export function formatTokPerSec(tokenCount: number, ms: number): string {
  if (ms === 0 || tokenCount === 0) return "—";
  const sec = ms / 1000;
  return `${(tokenCount / sec).toFixed(1)}`;
}
