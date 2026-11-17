import { ConfirmDialog } from "../ui/ConfirmDialog/ConfirmDialog";
import { Body } from "../ui/Typography/Typography";

interface ExitConfirmDialogProps {
  /** The lines from `exitBlockers`: what the exit would stop. */
  blockers: readonly string[];
  onExit: () => void;
  onKeepRunning: () => void;
}

/**
 * The one confirmation for quitting while work runs. The tray's Exit and a window close (with the tray
 * setting off) both show it, so the two prompts say the same thing.
 */
export function ExitConfirmDialog({ blockers, onExit, onKeepRunning }: ExitConfirmDialogProps) {
  return (
    <ConfirmDialog
      title="Exit LocalGenie?"
      message={
        <>
          <Body>These are still running and will be stopped:</Body>
          <ul>
            {blockers.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      }
      confirmLabel="Exit"
      cancelLabel="Keep running"
      onConfirm={onExit}
      onCancel={onKeepRunning}
    />
  );
}
