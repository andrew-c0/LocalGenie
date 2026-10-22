import { getCurrentWindow } from "@tauri-apps/api/window";

/** Minimize the main window. */
export async function minimizeWindow(): Promise<void> {
  return getCurrentWindow().minimize();
}

/** Maximize the main window, or restore it when already maximized. */
export async function toggleMaximizeWindow(): Promise<void> {
  return getCurrentWindow().toggleMaximize();
}

/** Ask whether the main window is maximized. */
export async function isWindowMaximized(): Promise<boolean> {
  return getCurrentWindow().isMaximized();
}

/** Request a close. Goes through the close-requested listeners first. */
export async function closeWindow(): Promise<void> {
  return getCurrentWindow().close();
}

/** Close the window without asking the close-requested listeners again. */
export async function destroyWindow(): Promise<void> {
  return getCurrentWindow().destroy();
}

/**
 * Run `shouldBlock` whenever the user tries to close the window. Return `true`
 * from it to keep the window open. Resolves to a function that removes the listener.
 */
export function onWindowCloseRequested(shouldBlock: () => boolean): Promise<() => void> {
  return getCurrentWindow().onCloseRequested((event) => {
    if (shouldBlock()) event.preventDefault();
  });
}

/** Subscribe to window resize, which also fires when the window is maximized or restored. */
export function onWindowResized(handler: () => void): Promise<() => void> {
  return getCurrentWindow().onResized(() => handler());
}
