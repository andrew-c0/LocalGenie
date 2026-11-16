import { useEffect, useState } from "react";
import { exitApp, onExitRequested } from "../../services/background";
import { useDispatchStore } from "../../stores/dispatchStore";
import { useDownloadStore } from "../../stores/downloadStore";
import { errorMessage } from "../../utils/errorMessage";
import { exitBlockers } from "../../utils/exitBlockers";
import { toast } from "../../utils/toast";
import { ConfirmDialog } from "../ui/ConfirmDialog/ConfirmDialog";

/**
 * Handles the tray's Exit item. Quits at once when nothing is running; otherwise lists what would be
 * interrupted and quits only when the user confirms. Cancel keeps the window open.
 */
export default function ExitGuard() {
  const [blockers, setBlockers] = useState<string[] | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    onExitRequested(() => {
      const found = exitBlockers(
        useDownloadStore.getState().downloads,
        useDispatchStore.getState().tasks,
      );
      if (found.length === 0) void quit();
      else setBlockers(found);
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
    <ConfirmDialog
      title="Exit LocalGenie?"
      message={
        <ul>
          {blockers.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      }
      confirmLabel="Exit anyway"
      onConfirm={() => {
        setBlockers(null);
        void quit();
      }}
      onCancel={() => setBlockers(null)}
    />
  );
}

/** Quits the app. A failure is shown, since the user asked for it. */
async function quit(): Promise<void> {
  try {
    await exitApp();
  } catch (err) {
    toast.error("Could not exit LocalGenie", errorMessage(err));
  }
}
