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

/** Compact byte size with units. */
export function formatBytes(n?: number): string {
  if (n == null) return "—";
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
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
