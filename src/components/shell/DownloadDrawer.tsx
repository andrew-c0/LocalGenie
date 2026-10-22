import {
  Button,
  Caption1Strong,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  makeStyles,
  Text,
  tokens,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { cancelDownload } from "../../services/download";
import { isDownloadActive, startGGUFDownload, useDownloadStore } from "../../stores/downloadStore";
import { DownloadItemCard } from "./DownloadItemCard";

const useStyles = makeStyles({
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    marginBottom: tokens.spacingVerticalM,
  },
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
  },
});

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Right-side drawer listing active, finished and cancelled downloads. */
export default function DownloadDrawer({ open, onClose }: Props) {
  const styles = useStyles();
  const downloads = useDownloadStore((s) => s.downloads);
  const remove = useDownloadStore((s) => s.remove);
  const clearFinished = useDownloadStore((s) => s.clearFinished);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const setBusy = (id: string, busy: boolean) =>
    setLoadingIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  const handleCancel = async (id: string) => {
    if (loadingIds.has(id)) return;
    setBusy(id, true);
    try {
      await cancelDownload(id).catch(() => undefined);
    } finally {
      setBusy(id, false);
    }
  };

  /** Resume a cancelled download: the same flow restarts and the backend continues from the partial file. */
  const handleResume = (id: string) => {
    const variant = downloads.find((d) => d.id === id)?.variant;
    if (!variant || loadingIds.has(id)) return;
    setBusy(id, true);
    void startGGUFDownload(variant).finally(() => setBusy(id, false));
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
              appearance="subtle"
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
          <div className={styles.toolbar}>
            <Button appearance="subtle" size="small" onClick={clearFinished}>
              Clear finished
            </Button>
          </div>
        )}

        {active.length > 0 && (
          <section className={styles.section}>
            <Caption1Strong>Active</Caption1Strong>
            {active.map((d) => (
              <DownloadItemCard
                key={d.id}
                download={d}
                active
                busy={loadingIds.has(d.id)}
                onCancel={handleCancel}
                onResume={handleResume}
                onRemove={remove}
              />
            ))}
          </section>
        )}

        {past.length > 0 && (
          <section className={styles.section}>
            <Caption1Strong>History</Caption1Strong>
            {past.map((d) => (
              <DownloadItemCard
                key={d.id}
                download={d}
                active={false}
                busy={loadingIds.has(d.id)}
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
