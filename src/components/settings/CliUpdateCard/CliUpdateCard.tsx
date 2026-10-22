import {
  Button,
  Card,
  Spinner,
  Subtitle1,
  Toast,
  ToastBody,
  ToastTitle,
  useToastController,
} from "@fluentui/react-components";
import { ArrowUpRegular } from "@fluentui/react-icons";
import { useState } from "react";
import { useTauriEvent } from "../../../hooks";
import * as geniex from "../../../services/geniex";
import { useModelStore } from "../../../stores/modelStore";
import type { UpdateInfo } from "../../../types";
import "./CliUpdateCard.css";
import { Body, Meta } from "../../ui/Typography/Typography";

/** Shows the installed and latest GenieX CLI versions and runs the installer-based update. */
export default function CliUpdateCard({ updateInfo }: { updateInfo: UpdateInfo | null }) {
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
      <div className="cli-update-card__stack">
        <Subtitle1>GenieX CLI</Subtitle1>
        {updateInfo ? (
          <>
            <div className="cli-update-card__row">
              <Meta>Installed</Meta>
              <Body>v{updateInfo.current_version}</Body>
            </div>
            {updateInfo.update_available ? (
              <>
                <div className="cli-update-card__row">
                  <Meta>Latest</Meta>
                  <Body>v{updateInfo.latest_version}</Body>
                </div>
                <Body>
                  {updating && updateStatus ? updateStatus : "A newer version is available."}
                </Body>
                <div className="cli-update-card__actions">
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
              <Body>You're on the latest version.</Body>
            )}
          </>
        ) : (
          <Body>Checking for updates…</Body>
        )}
      </div>
    </Card>
  );
}
