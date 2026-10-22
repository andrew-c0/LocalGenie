import { listen } from "@tauri-apps/api/event";

/** Subscribe to a backend event. Resolves to a function that removes the listener. */
export function listenEvent<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  return listen<T>(event, (e) => handler(e.payload));
}
