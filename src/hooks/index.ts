import { useEffect, useRef } from "react";
import { listenEvent } from "../services/events";

/**
 * Subscribe to a Tauri event for the component's lifetime.
 * Subscribes once per event name; the latest handler is read from a ref, so
 * re-renders neither re-register the listener nor drop events in between.
 */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listenEvent<T>(event, (payload) => handlerRef.current(payload)).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [event]);
}
