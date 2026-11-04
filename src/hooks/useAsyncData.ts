import { useCallback, useEffect, useRef, useState } from "react";

/** Where a load stands: still running, finished with data, or failed. */
export type LoadStatus = "loading" | "ready" | "error";

export interface AsyncData<T> {
  status: LoadStatus;
  /** The loaded value. Null until the load is ready, and for a failed load. */
  data: T | null;
  /** The raw error when status is error (a string from a Tauri command, or an Error). */
  error: unknown;
  /** Run the load again with the same key. */
  retry: () => void;
}

interface AsyncState<T> {
  /** The key this state belongs to. A state for another key reads as loading. */
  key: string | null;
  /** Counts retries; a change re-runs the load. */
  attempt: number;
  status: LoadStatus;
  data: T | null;
  error: unknown;
}

/**
 * Runs `load(key)` when `key` changes, and again on `retry`. A null key loads nothing and reads as
 * loading. Each cloud part of a page takes its own call, so each shows its own skeleton, error and
 * retry. The loader is read through a ref: an inline arrow does not start a new load on each render.
 *
 * A result that arrives after the key has changed is dropped. Keys are strings (a repo id, or a
 * constant for a single request).
 */
export function useAsyncData<T>(
  key: string | null,
  load: (key: string) => Promise<T>,
): AsyncData<T> {
  const [state, setState] = useState<AsyncState<T>>({
    key: null,
    attempt: 0,
    status: "loading",
    data: null,
    error: null,
  });
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  });

  const { attempt } = state;

  useEffect(() => {
    if (key === null) return;
    const requestKey: string = key;
    let cancelled = false;
    loadRef.current(requestKey).then(
      (data) => {
        if (!cancelled) setState({ key: requestKey, attempt, status: "ready", data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setState({ key: requestKey, attempt, status: "error", data: null, error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  const retry = useCallback(() => {
    setState((prev) => ({
      key,
      attempt: prev.attempt + 1,
      status: "loading",
      data: null,
      error: null,
    }));
  }, [key]);

  const current = state.key === key ? state : null;
  return {
    status: current?.status ?? "loading",
    data: current?.data ?? null,
    error: current?.error ?? null,
    retry,
  };
}
