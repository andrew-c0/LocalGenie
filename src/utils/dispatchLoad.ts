/** Where the Dispatch conversations stand on the page: still loading, failed to load, or loaded. */
export type DispatchLoadState = "loading" | "failed" | "ready";

/**
 * The page's load state from the store. Loaded wins. Otherwise an error means the read failed, and no error
 * means it is still under way.
 */
export function dispatchLoadStateOf(loaded: boolean, loadError: unknown): DispatchLoadState {
  if (loaded) return "ready";
  return loadError === null ? "loading" : "failed";
}
