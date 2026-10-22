/**
 * Run `worker` over `items` with at most `limit` calls in flight.
 * Resolves once every item has been processed. Worker errors are the worker's own concern.
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(lanes);
}
