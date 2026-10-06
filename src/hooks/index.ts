import { useToastController } from "@fluentui/react-components";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";

/** Hook returning a stable toast dispatcher for the app toaster. */
export function useAppToast() {
  return useToastController("app-toaster");
}

/** Debounce a callback — cancels the previous pending call when invoked again. */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delayMs: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return ((...args: Parameters<T>) => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
  }) as T;
}

/** Register a Tauri event listener for the component's lifetime. */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  useEffect(() => {
    const unlisten = listen<T>(event, (e) => handler(e.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  });
}
