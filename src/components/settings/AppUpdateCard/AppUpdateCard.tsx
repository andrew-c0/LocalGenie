import { Button, Card } from "@fluentui/react-components";
import { useState } from "react";
import { useAppInfo } from "../../../hooks/useAppInfo";
import { useRunningWork } from "../../../hooks/useRunningWork";
import { useAppUpdateStore } from "../../../stores/appUpdateStore";
import { lastCheckedLabel } from "../../../utils/appUpdate";
import { SERVICE_NAMES } from "../../../utils/networkError";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { Flex } from "../../ui/Flex/Flex";
import { RetryBlock } from "../../ui/RetryBlock/RetryBlock";
import { SkeletonLines } from "../../ui/Skeletons/SkeletonLines";
import { Body, Meta, SectionTitle } from "../../ui/Typography/Typography";
import { AppUpdateAvailable } from "./AppUpdateAvailable";

/**
 * Settings > Application & Runtime: the running version, when it was last checked, a manual check and
 * the announced update with its install button. Installing asks first when something would be cut off.
 */
export default function AppUpdateCard() {
  const info = useAppInfo();
  const status = useAppUpdateStore((s) => s.status);
  const update = useAppUpdateStore((s) => s.update);
  const progress = useAppUpdateStore((s) => s.progress);
  const lastCheckedAt = useAppUpdateStore((s) => s.lastCheckedAt);
  const error = useAppUpdateStore((s) => s.error);
  const errorAction = useAppUpdateStore((s) => s.errorAction);
  const checkNow = useAppUpdateStore((s) => s.checkNow);
  const installUpdate = useAppUpdateStore((s) => s.installUpdate);
  const runningWork = useRunningWork();
  const [confirming, setConfirming] = useState(false);

  const busy = status === "checking" || status === "downloading" || status === "installing";
  const checkFailed = status === "error" && errorAction === "check";
  const installFailed = status === "error" && errorAction === "install";

  const requestInstall = () => {
    if (runningWork.length > 0) setConfirming(true);
    else void installUpdate();
  };

  return (
    <Card>
      <Flex direction="column" gap="s">
        <SectionTitle>App updates</SectionTitle>
        <Body>Version {info?.versions.version ?? "..."}</Body>
        <Meta>{lastCheckedLabel(lastCheckedAt)}</Meta>

        {status === "checking" && <SkeletonLines lines={2} />}
        {status === "upToDate" && <Body>LocalGenie is up to date.</Body>}
        {checkFailed && (
          <RetryBlock
            compact
            error={error}
            subject={SERVICE_NAMES.github}
            lead="Could not check for updates."
            onRetry={() => void checkNow()}
          />
        )}
        {update && (
          <AppUpdateAvailable
            update={update}
            status={status}
            progress={progress}
            installFailed={installFailed}
            onInstall={requestInstall}
          />
        )}
        {installFailed && (
          <RetryBlock
            compact
            error={error}
            subject={SERVICE_NAMES.github}
            lead="The update could not be installed."
            onRetry={requestInstall}
          />
        )}

        <Flex>
          <Button appearance="secondary" disabled={busy} onClick={() => void checkNow()}>
            Check for updates
          </Button>
        </Flex>
      </Flex>

      {confirming && update && (
        <ConfirmDialog
          title="Install the update and restart?"
          message={
            <Flex direction="column" gap="s">
              <Body>
                LocalGenie restarts to install version {update.version}. These are still running,
                and the restart stops them:
              </Body>
              {runningWork.map((line) => (
                <Body key={line}>{line}</Body>
              ))}
            </Flex>
          }
          confirmLabel="Continue anyway"
          onConfirm={() => {
            setConfirming(false);
            void installUpdate();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </Card>
  );
}
