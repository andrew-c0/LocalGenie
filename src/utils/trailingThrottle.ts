/** A throttled `apply` call. `push` sends a value now or at the end of the interval; `cancel` drops a pending one. */
export interface TrailingThrottle<T> {
  push: (value: T) => void;
  cancel: () => void;
}

/**
 * Applies pushed values at most once per `intervalMs`, always ending on the latest value (a trailing
 * update). A value equal to the last applied one is skipped, so `apply` runs only on a real change.
 */
export function createTrailingThrottle<T>(
  initial: T,
  apply: (value: T) => void,
  intervalMs: number,
): TrailingThrottle<T> {
  let lastApplied = initial;
  let lastAppliedAt: number | null = null;
  let pending: { value: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = (): void => {
    timer = undefined;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    if (Object.is(value, lastApplied)) return;
    lastApplied = value;
    lastAppliedAt = Date.now();
    apply(value);
  };

  return {
    push(value) {
      pending = { value };
      if (timer !== undefined) return;
      const waitMs = lastAppliedAt === null ? 0 : lastAppliedAt + intervalMs - Date.now();
      if (waitMs > 0) {
        timer = setTimeout(flush, waitMs);
      } else {
        flush();
      }
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}
