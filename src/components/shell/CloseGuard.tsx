import { useEffect, useState } from "react";
import { destroyWindow, onWindowCloseRequested } from "../../services/window";
import { useBackgroundStore } from "../../stores/backgroundStore";
import { isDownloadActive, useDownloadStore } from "../../stores/downloadStore";
import { ConfirmDialog } from "../ui/ConfirmDialog/ConfirmDialog";

const activeDownloadCount = () =>
  useDownloadStore.getState().downloads.filter((d) => isDownloadActive(d.status)).length;

/** True only once the saved settings say the app keeps running in the tray. Unloaded counts as off. */
const keepsRunningInTray = () => useBackgroundStore.getState().settings?.keepRunningInTray === true;

/**
 * Keeps the window open while a model is downloading or importing. A close request
 * (title bar button, Alt+F4, taskbar) shows a confirmation; confirming closes the
 * window for real. Partial files are kept, so an interrupted download can resume.
 * With "keep running in the tray" on, the backend hides the window instead. This listener must still
 * block the close then: the window API destroys the window itself after the listeners, which would undo
 * the hide. No confirmation is shown, since downloads keep running in the tray.
 */
export default function CloseGuard() {
  const [confirming, setConfirming] = useState(false);
  const activeCount = useDownloadStore(
    (s) => s.downloads.filter((d) => isDownloadActive(d.status)).length,
  );

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    onWindowCloseRequested(() => {
      if (keepsRunningInTray()) return true;
      const blocked = activeDownloadCount() > 0;
      if (blocked) setConfirming(true);
      return blocked;
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!confirming) return null;

  const plural = activeCount === 1 ? "" : "s";
  return (
    <ConfirmDialog
      title="Close LocalGenie?"
      message={`${activeCount} model download${plural} still in progress. Closing now will interrupt ${activeCount === 1 ? "it" : "them"}. The partial file${plural} will be kept, so the download can resume later.`}
      confirmLabel="Close anyway"
      onConfirm={() => {
        setConfirming(false);
        destroyWindow().catch(() => undefined);
      }}
      onCancel={() => setConfirming(false)}
    />
  );
}
