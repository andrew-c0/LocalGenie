import {
  Body1,
  Button,
  Caption1,
  Card,
  makeStyles,
  Spinner,
  Subtitle1,
  Text,
  Toast,
  ToastBody,
  ToastTitle,
  tokens,
  useToastController,
} from "@fluentui/react-components";
import { ArrowUpRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useTauriEvent } from "../../hooks";
import * as geniex from "../../services/geniex";
import { useModelStore } from "../../stores/modelStore";
import type { UpdateInfo } from "../../types";

const useStyles = makeStyles({
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
});

/** Shows the installed and latest GenieX CLI versions and runs the installer-based update. */
export default function CliUpdateCard({ updateInfo }: { updateInfo: UpdateInfo | null }) {
  const styles = useStyles();
  const { dispatchToast } = useToastController("app-toaster");
  const setUpdateInfo = useModelStore((s) => s.setUpdateInfo);
  const [updating, setUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  // Progress arrives only while an update runs.
  useTauriEvent<{ message: string }>("geniex-update-progress", (payload) => {
    setUpdateStatus(payload.message);
  });

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateStatus("Starting update...");
    try {
      await geniex.updateGeniex();

      // Re-check version after update to confirm it took effect.
      const info = await geniex.checkForCliUpdate();
      setUpdateInfo(info);
      if (!info.update_available) {
        dispatchToast(
          <Toast>
            <ToastTitle>Update complete</ToastTitle>
            <ToastBody>Updated to CLI {info.latest_version}.</ToastBody>
          </Toast>,
          { intent: "success" },
        );
      } else {
        dispatchToast(
          <Toast>
            <ToastTitle>Update downloaded</ToastTitle>
            <ToastBody>Restart the app to finish updating to {info.latest_version}.</ToastBody>
          </Toast>,
          { intent: "warning" },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[settings] Update failed:", msg);
      dispatchToast(
        <Toast>
          <ToastTitle>Update failed</ToastTitle>
          <ToastBody>{msg}</ToastBody>
        </Toast>,
        { intent: "error" },
      );
    } finally {
      setUpdating(false);
      setUpdateStatus(null);
    }
  };

  return (
    <Card>
      <div className={styles.stack}>
        <Subtitle1>GenieX CLI</Subtitle1>
        {updateInfo ? (
          <>
            <div className={styles.row}>
              <Caption1>Installed</Caption1>
              <Text>v{updateInfo.current_version}</Text>
            </div>
            {updateInfo.update_available ? (
              <>
                <div className={styles.row}>
                  <Caption1>Latest</Caption1>
                  <Text>v{updateInfo.latest_version}</Text>
                </div>
                <Body1>
                  {updating && updateStatus ? updateStatus : "A newer version is available."}
                </Body1>
                <div className={styles.actions}>
                  <Button
                    appearance="primary"
                    icon={updating ? undefined : <ArrowUpRegular />}
                    onClick={handleUpdate}
                    disabled={updating}
                  >
                    {updating ? <Spinner size="tiny" /> : "Update Now"}
                  </Button>
                </div>
              </>
            ) : (
              <Body1>You're on the latest version.</Body1>
            )}
          </>
        ) : (
          <Body1>Checking for updates…</Body1>
        )}
      </div>
    </Card>
  );
}
