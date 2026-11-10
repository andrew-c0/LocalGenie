import { Button, Card } from "@fluentui/react-components";
import type { AppUpdateStatus } from "../../../stores/appUpdateStore";
import type { AppUpdateInfo, AppUpdateProgress } from "../../../types";
import { progressLabel, trimReleaseNotes } from "../../../utils/appUpdate";
import { Flex } from "../../ui/Flex/Flex";
import { MarkdownContent } from "../../ui/MarkdownContent/MarkdownContent";
import { ProgressBar } from "../../ui/ProgressBar/ProgressBar";
import { BodyStrong, Meta } from "../../ui/Typography/Typography";

interface AppUpdateAvailableProps {
  update: AppUpdateInfo;
  status: AppUpdateStatus;
  progress: AppUpdateProgress;
  /** The download or install failed; the card shows the retry block instead of the button. */
  installFailed: boolean;
  onInstall: () => void;
}

/**
 * The announced version: its release notes, the download progress while it runs, and the button that
 * downloads, installs and restarts. Shown only while an update is known.
 */
export function AppUpdateAvailable({
  update,
  status,
  progress,
  installFailed,
  onInstall,
}: AppUpdateAvailableProps) {
  const busy = status === "downloading" || status === "installing";
  const notes = trimReleaseNotes(update.notes);

  return (
    <Card appearance="filled">
      <Flex direction="column" gap="s">
        <BodyStrong>Version {update.version} is available</BodyStrong>
        {notes && <MarkdownContent>{notes}</MarkdownContent>}
        {status === "downloading" && (
          <Flex direction="column" gap="xs">
            <ProgressBar
              value={progress.fraction === null ? null : progress.fraction * 100}
              color="cyan"
            />
            <Meta>{progressLabel(progress)}</Meta>
          </Flex>
        )}
        {status === "installing" && (
          <Meta>Installing the update. LocalGenie restarts when it is done.</Meta>
        )}
        {!installFailed && (
          <Flex>
            <Button appearance="primary" disabled={busy} onClick={onInstall}>
              Download and restart
            </Button>
          </Flex>
        )}
      </Flex>
    </Card>
  );
}
