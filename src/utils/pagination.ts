/** Pages needed for `total` items at `pageSize` per page. An empty list still has one page. */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** A 1-based page number, kept between 1 and the last page of `total` items. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), pageCountOf(total, pageSize));
}

/** The items on one page. The page is clamped, so a page past the end shows the last one. */
export function pageOf<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const start = (clampPage(page, items.length, pageSize) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/** The range shown for a page, for example `1-10 of 34`, or `0 of 0` for an empty list. */
export function rangeLabelOf(total: number, page: number, pageSize: number): string {
  if (total === 0) return "0 of 0";
  const current = clampPage(page, total, pageSize);
  const first = (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);
  return `${first}-${last} of ${total}`;
}
