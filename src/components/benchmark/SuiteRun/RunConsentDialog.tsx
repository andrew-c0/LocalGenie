import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from "@fluentui/react-components";
import { useState } from "react";

interface RunConsentDialogProps {
  /** Called with whether the user asked not to be shown this again. */
  onConfirm: (dontShowAgain: boolean) => void;
  onCancel: () => void;
}

/**
 * Asked before a run starts. Starting the run is the user's consent to the load it puts on the
 * device, so the dialog says so; "Don't show again" skips it for later runs.
 */
export function RunConsentDialog({ onConfirm, onCancel }: RunConsentDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Start this benchmark run?</DialogTitle>
          <DialogContent>
            <p>
              A run loads the model and keeps the selected compute target busy for several minutes.
              The device may get hot, its fans may run louder and the battery may drain faster.
            </p>
            <p>Starting the run means you agree to this load.</p>
            <Checkbox
              label="Don't show this again"
              checked={dontShowAgain}
              onChange={(_, data) => setDontShowAgain(data.checked === true)}
            />
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={() => onConfirm(dontShowAgain)}>
              Start run
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
