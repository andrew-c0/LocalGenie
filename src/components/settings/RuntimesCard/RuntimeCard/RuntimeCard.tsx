import { Button, Card } from "@fluentui/react-components";
import type { RuntimeInfo, RuntimeInstallProgress, RuntimeUpdateInfo } from "../../../../types";
import { ErrorBanner } from "../../../ui/ErrorBanner/ErrorBanner";
import { ExternalLink } from "../../../ui/ExternalLink/ExternalLink";
import { Flex } from "../../../ui/Flex/Flex";
import { StatusBadge } from "../../../ui/StatusBadge/StatusBadge";
import { Body, CardTitle, Meta } from "../../../ui/Typography/Typography";
import type { RuntimeAction } from "../useRuntimeOperations";
import { RuntimeProgress } from "./RuntimeProgress";
import "./RuntimeCard.css";

const ACTIVITY_LABELS: Record<RuntimeAction, string> = {
  install: "Installing…",
  update: "Updating…",
  uninstall: "Removing…",
};

interface RuntimeCardProps {
  runtime: RuntimeInfo;
  /** Undefined when the update check for this runtime failed or has not run. */
  update: RuntimeUpdateInfo | undefined;
  /** True while any runtime operation runs; every action waits for it. */
  isBusy: boolean;
  /** The action running on this runtime, or null. */
  activeAction: RuntimeAction | null;
  /** Progress of this runtime's install or update. Null otherwise. */
  progress: RuntimeInstallProgress | null;
  failureMessage: string | null;
  onInstall: () => void;
  onUninstall: () => void;
}

/** One runtime: installed and latest versions, and its install, update and uninstall actions. */
export default function RuntimeCard({
  runtime,
  update,
  isBusy,
  activeAction,
  progress,
  failureMessage,
  onInstall,
  onUninstall,
}: RuntimeCardProps) {
  const isInstalled = runtime.installedVersion !== null;
  const availableUpdate = isInstalled && update?.updateAvailable ? update : undefined;

  return (
    <Card>
      <Flex direction="column" gap="s">
        <Flex justify="between" align="center" gap="m">
          <CardTitle>{runtime.displayName}</CardTitle>
          <StatusBadge tone={isInstalled ? "green" : "default"}>
            {isInstalled ? "Installed" : "Not installed"}
          </StatusBadge>
        </Flex>
        <Meta>{runtime.repo}</Meta>

        <Flex justify="between" align="center" gap="m">
          <Meta>Installed</Meta>
          <Body>{runtime.installedVersion ?? "None"}</Body>
        </Flex>
        <Flex justify="between" align="center" gap="m">
          <Meta>Latest</Meta>
          <Body>{update?.latestVersion ?? "Unknown"}</Body>
        </Flex>
        {runtime.installPath && <Meta className="runtime-card__path">{runtime.installPath}</Meta>}

        {progress ? (
          <RuntimeProgress progress={progress} />
        ) : (
          activeAction && <Body>{ACTIVITY_LABELS[activeAction]}</Body>
        )}
        {failureMessage && <ErrorBanner message={failureMessage} />}

        <Flex gap="s" align="center" wrap>
          {!isInstalled && (
            <Button appearance="primary" onClick={onInstall} disabled={isBusy}>
              Install
            </Button>
          )}
          {availableUpdate && (
            <Button appearance="primary" onClick={onInstall} disabled={isBusy}>
              Update to {availableUpdate.latestVersion}
            </Button>
          )}
          {isInstalled && (
            <Button appearance="secondary" onClick={onUninstall} disabled={isBusy}>
              Uninstall
            </Button>
          )}
          {update && <ExternalLink url={update.releaseUrl}>Release notes</ExternalLink>}
        </Flex>
      </Flex>
    </Card>
  );
}
