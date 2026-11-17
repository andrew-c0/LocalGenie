import { useEffect, useState } from "react";
import { exitApp, onExitRequested } from "../../services/background";
import { errorMessage } from "../../utils/errorMessage";
import { exitBlockers, trayExitAction } from "../../utils/exitBlockers";
import { toast } from "../../utils/toast";
import { ExitConfirmDialog } from "./ExitConfirmDialog";
import { readRunningWork } from "./readRunningWork";

/**
 * Handles the tray's Exit item. Quits at once when nothing is running; otherwise lists what would be
 * interrupted and quits only when the user confirms. "Keep running" keeps the app open.
 */
export default function ExitGuard() {
  const [blockers, setBlockers] = useState<string[] | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    onExitRequested(() => {
      const lines = exitBlockers(readRunningWork());
      if (trayExitAction(lines) === "quit") void quit();
      else setBlockers(lines);
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
        void quit();
      }}
      onKeepRunning={() => setBlockers(null)}
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
