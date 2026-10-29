import { usePlaygroundEvents } from "./usePlaygroundEvents";

/**
 * Playground side effects with no UI: model download and image generation events. Mounted by the
 * main layout, not by the page, so a download or an image keeps updating while the user is elsewhere.
 */
export function PlaygroundRuntime() {
  usePlaygroundEvents();
  return null;
}
