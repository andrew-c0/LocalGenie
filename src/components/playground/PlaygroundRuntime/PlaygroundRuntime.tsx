import { usePlaygroundEvents } from "./usePlaygroundEvents";

/**
 * Playground side effects with no UI: model download, image generation and speech job events. Mounted
 * by the main layout, not by the page, so a download or a job keeps updating while the user is elsewhere.
 */
export function PlaygroundRuntime() {
  usePlaygroundEvents();
  return null;
}
