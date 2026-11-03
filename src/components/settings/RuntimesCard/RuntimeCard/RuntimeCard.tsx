import { Button, Spinner, Tooltip } from "@fluentui/react-components";
import { PaintBrushRegular, PersonVoiceRegular, PuzzlePieceRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";
import geniexLogo from "../../../../assets/geniex-logo.png";
import { useRuntimeBusy } from "../../../../hooks/useRuntimeBusy";
import type { RuntimeInfo, RuntimeUpdateInfo } from "../../../../types";
import { SD_CPP_RUNTIME_ID } from "../../../../utils/playground";
import { GENIEX_RUNTIME_ID } from "../../../../utils/runtimeSpecifics";
import { SHERPA_RUNTIME_ID } from "../../../../utils/speech";
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
  /** Extra lines under the title, from `useRuntimeDetails`. */
  details: RuntimeDetail[];
  onInstall: () => void;
  onUninstall: () => void;
  /** Re-reads the runtime list. Offered while the runtime is not installed. */
  onCheckAgain: () => void;
}

/**
 * One runtime: installed and latest versions, and its install, update and uninstall actions. An install or
 * update is queued in the Downloads drawer; an uninstall runs from this card. The card is busy while either
 * runs: it disables its buttons and menu, and shows a spinner in place of the main action during an uninstall.
 */
export default function RuntimeCard({
  runtime,
  update,
  details,
  onInstall,
  onUninstall,
  onCheckAgain,
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

  return (
    <RuntimePanel
      title={runtime.displayName}
      icon={RUNTIME_ICONS[runtime.id] ?? <PuzzlePieceRegular />}
      repo={runtime.repo}
      installedVersion={runtime.installedVersion}
      latestVersion={update?.latestVersion ?? null}
      details={details}
      releaseUrl={update?.releaseUrl}
      isBusy={busy}
      primaryAction={primaryAction}
      menuItems={menuItems}
    />
  );
}
