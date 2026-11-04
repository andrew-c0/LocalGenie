import { Button, Spinner, Tooltip } from "@fluentui/react-components";
import { PaintBrushRegular, PersonVoiceRegular, PuzzlePieceRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import geniexLogo from "../../../../assets/geniex-logo.png";
import { useRuntimeBusy } from "../../../../hooks/useRuntimeBusy";
import type { UpdateCheck } from "../../../../stores/runtimeStore";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../../../../types";
import { SERVICE_NAMES } from "../../../../utils/networkError";
import { SD_CPP_RUNTIME_ID } from "../../../../utils/playground";
import { GENIEX_RUNTIME_ID } from "../../../../utils/runtimeSpecifics";
import { SHERPA_RUNTIME_ID } from "../../../../utils/speech";
import { RetryBlock } from "../../../ui/RetryBlock/RetryBlock";
import RuntimePanel, { type RuntimeMenuItem } from "../RuntimePanel/RuntimePanel";
import type { RuntimeDetail } from "../useRuntimeDetails";

/** The icon for a runtime, by registry id. A runtime not listed here gets a generic icon. */
const RUNTIME_ICONS: Record<string, ReactNode> = {
  [GENIEX_RUNTIME_ID]: <img src={geniexLogo} alt="" />,
  [SD_CPP_RUNTIME_ID]: <PaintBrushRegular />,
  [SHERPA_RUNTIME_ID]: <PersonVoiceRegular />,
};

interface RuntimeCardProps {
  runtime: RuntimeInfo;
  /** Undefined when the update check for this runtime failed or has not run. */
  update: RuntimeUpdateInfo | undefined;
  /** Where this runtime's update check stands: checking shows a placeholder, failed shows a retry line. */
  updateCheck: UpdateCheck;
  /** Extra lines under the title, from `useRuntimeDetails`. */
  details: RuntimeDetail[];
  onInstall: () => void;
  onUninstall: () => void;
  /** Re-reads the runtime list. Offered while the runtime is not installed. */
  onCheckAgain: () => void;
  /** Checks this runtime's latest release again. Offered when the check failed. */
  onRecheckUpdate: () => void;
}

/**
 * One runtime: installed and latest versions, and its install, update and uninstall actions. An install or
 * update is queued in the Downloads drawer; an uninstall runs from this card. The card is busy while either
 * runs: it disables its buttons and menu, and shows a spinner in place of the main action during an uninstall.
 */
export default function RuntimeCard({
  runtime,
  update,
  updateCheck,
  details,
  onInstall,
  onUninstall,
  onCheckAgain,
  onRecheckUpdate,
}: RuntimeCardProps) {
  const { installing, removing } = useRuntimeBusy(runtime.id);
  const busy = installing || removing;
  const isInstalled = runtime.installedVersion !== null;
  const availableUpdate = isInstalled && update?.updateAvailable ? update : undefined;
  const menuItems: RuntimeMenuItem[] = isInstalled
    ? [{ label: "Uninstall", onClick: onUninstall }]
    : [
        { label: "Check again", onClick: onCheckAgain },
        { label: "Uninstall", onClick: onUninstall, disabled: true },
      ];

  let primaryAction: ReactNode = null;
  if (removing) {
    primaryAction = <Spinner size="tiny" aria-label={`Removing ${runtime.displayName}`} />;
  } else if (!isInstalled) {
    primaryAction = (
      <Button appearance="primary" onClick={onInstall} disabled={busy}>
        Install
      </Button>
    );
  } else if (availableUpdate) {
    primaryAction = (
      <Tooltip content={`Update to ${availableUpdate.latestVersion}`} relationship="description">
        <Button appearance="primary" onClick={onInstall} disabled={busy}>
          Update
        </Button>
      </Tooltip>
    );
  }

  // A failed check does not block install or uninstall: it only offers a retry line under the row.
  const updateNotice =
    updateCheck.status === "failed" ? (
      <RetryBlock
        compact
        lead="Could not check for updates."
        error={updateCheck.error}
        subject={SERVICE_NAMES.github}
        onRetry={onRecheckUpdate}
      />
    ) : undefined;

  return (
    <RuntimePanel
      title={runtime.displayName}
      icon={RUNTIME_ICONS[runtime.id] ?? <PuzzlePieceRegular />}
      repo={runtime.repo}
      installedVersion={runtime.installedVersion}
      latestVersion={update?.latestVersion ?? null}
      isCheckingLatest={updateCheck.status === "checking"}
      details={details}
      releaseUrl={update?.releaseUrl}
      notice={updateNotice}
      isBusy={busy}
      primaryAction={primaryAction}
      menuItems={menuItems}
    />
  );
}
