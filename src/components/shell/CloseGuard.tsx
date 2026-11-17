import { useEffect, useState } from "react";
import { destroyWindow, onWindowCloseRequested } from "../../services/window";
import { useBackgroundStore } from "../../stores/backgroundStore";
import { exitBlockers, windowCloseAction } from "../../utils/exitBlockers";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { readRunningWork } from "./readRunningWork";

/** True only once the saved settings say the app keeps running in the tray. Unloaded counts as off. */
const keepsRunningInTray = () => useBackgroundStore.getState().settings?.keepRunningInTray === true;

/**
 * Guards a window close request (title bar button, Alt+F4, taskbar) against cutting off running work. With
 * "keep running in the tray" on, the backend hides the window instead: this listener still blocks the close,
 * since the window API destroys the window itself after the listeners, which would undo the hide. No prompt
 * then. With it off, the window closes at once when nothing runs; otherwise the same confirmation as the tray's
 * Exit lists what would stop, and confirming closes the window for real. Partial downloads are kept, so an
 * interrupted download can resume.
 */
export default function CloseGuard() {
  const [blockers, setBlockers] = useState<string[] | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    onWindowCloseRequested(() => {
      const lines = exitBlockers(readRunningWork());
      const action = windowCloseAction(keepsRunningInTray(), lines);
      if (action === "confirm") setBlockers(lines);
      return action !== "close";
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (blockers === null) return null;

  return (
    <ExitConfirmDialog
      blockers={blockers}
      onExit={() => {
        setBlockers(null);
        destroyWindow().catch(() => undefined);
      }}
      onKeepRunning={() => setBlockers(null)}
    />
  );
}
