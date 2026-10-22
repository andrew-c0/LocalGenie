import { useEffect, useState } from "react";
import { destroyWindow, onWindowCloseRequested } from "../../services/window";
import { isDownloadActive, useDownloadStore } from "../../stores/downloadStore";
import { ConfirmDialog } from "../ui/ConfirmDialog/ConfirmDialog";

const activeDownloadCount = () =>
  useDownloadStore.getState().downloads.filter((d) => isDownloadActive(d.status)).length;

/**
 * Keeps the window open while a model is downloading or importing. A close request
 * (title bar button, Alt+F4, taskbar) shows a confirmation; confirming closes the
 * window for real. Partial files are kept, so an interrupted download can resume.
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
