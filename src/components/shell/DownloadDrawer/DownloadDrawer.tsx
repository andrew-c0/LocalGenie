import {
  Button,
  Caption1Strong,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  Text,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { isDownloadActive } from "../../../stores/downloadStore";
import { DownloadItemCard } from "./DownloadItemCard/DownloadItemCard";
import { useDownloadManager } from "./useDownloadManager";
import "./DownloadDrawer.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Right-side drawer listing active, finished and cancelled downloads. It also owns the download
 * pipeline (see `useDownloadManager`); other components only enqueue downloads in the store.
 */
export default function DownloadDrawer({ open, onClose }: Props) {
  const { downloads, cancelling, cancel, enqueue, remove, clearFinished } = useDownloadManager();

  /** A queued entry has no backend download yet, so cancelling it just removes it. */
  const handleCancel = (id: string) => {
    const entry = downloads.find((d) => d.id === id);
    if (entry?.status === "queued") remove(id);
    else void cancel(id);
  };

  /** Resume a cancelled download: queue it again and the backend continues from the partial file. */
  const handleResume = (id: string) => {
    const variant = downloads.find((d) => d.id === id)?.variant;
    if (variant) enqueue(variant);
  };

  const active = downloads.filter((d) => isDownloadActive(d.status));
  const past = downloads.filter(
    (d) => d.status === "finished" || d.status === "error" || d.status === "cancelled",
  );

  return (
    <Drawer
      open={open}
      position="end"
      size="small"
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button
              appearance="secondary"
              icon={<DismissRegular />}
              aria-label="Close downloads"
              onClick={onClose}
            />
          }
        >
          Downloads
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody>
        {downloads.length === 0 && <Text>No downloads yet.</Text>}

        {past.length > 0 && (
          <div className="download-drawer__toolbar">
            <Button appearance="secondary" onClick={clearFinished}>
              Clear finished
            </Button>
          </div>
        )}

        {active.length > 0 && (
          <section className="download-drawer__section">
            <Caption1Strong>Active</Caption1Strong>
            {active.map((d) => (
              <DownloadItemCard
                key={d.id}
                download={d}
                active
                busy={cancelling.has(d.id)}
                onCancel={handleCancel}
                onResume={handleResume}
                onRemove={remove}
              />
            ))}
          </section>
        )}

        {past.length > 0 && (
          <section className="download-drawer__section">
            <Caption1Strong>History</Caption1Strong>
            {past.map((d) => (
              <DownloadItemCard
                key={d.id}
                download={d}
                active={false}
                busy={cancelling.has(d.id)}
                onCancel={handleCancel}
                onResume={handleResume}
                onRemove={remove}
              />
            ))}
          </section>
        )}
      </DrawerBody>
    </Drawer>
  );
}
