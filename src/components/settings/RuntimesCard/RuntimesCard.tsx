import { useState } from "react";
import { useDownloadStore } from "../../../stores/downloadStore";
import type { RuntimeInfo } from "../../../types";
import { uninstallMessage } from "../../../utils/runtimeSpecifics";
import { uninstallRuntimeNow } from "../../../utils/runtimeUninstall";
import { refreshAfterRuntimeChange } from "../../../utils/runtimeUsage";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import RuntimeCard from "./RuntimeCard/RuntimeCard";
import { useRuntimeCatalog } from "./useRuntimeCatalog";
import { useRuntimeDetails } from "./useRuntimeDetails";

/**
 * Settings > Runtimes: one card per runtime, the GenieX CLI included. Install and update are queued in
 * the Downloads drawer, which runs them. Uninstall runs from the card: the card is busy until it ends,
 * and a toast reports the result.
 */
export default function RuntimesCard() {
  const catalog = useRuntimeCatalog();
  const details = useRuntimeDetails();
  const enqueueRuntime = useDownloadStore((s) => s.enqueueRuntime);
  const [uninstallTarget, setUninstallTarget] = useState<RuntimeInfo | null>(null);

  if (catalog.loadError) return <ErrorBanner message={catalog.loadError} />;
  if (!catalog.runtimes) return <StateBlock message="Reading runtimes…" />;

  const handleUninstallConfirm = (runtime: RuntimeInfo) => {
    setUninstallTarget(null);
    void uninstallRuntimeNow(runtime);
  };

  return (
    <Flex direction="column" gap="s">
      {catalog.runtimes.map((runtime) => {
        const update = catalog.updatesById[runtime.id];
        return (
          <RuntimeCard
            key={runtime.id}
            runtime={runtime}
            update={update}
            updateCheck={catalog.updateCheckOf(runtime.id)}
            details={details[runtime.id] ?? []}
            onInstall={() =>
              enqueueRuntime({
                runtimeId: runtime.id,
                displayName: runtime.displayName,
                version: update?.latestVersion,
              })
            }
            onUninstall={() => setUninstallTarget(runtime)}
            onCheckAgain={() => void refreshAfterRuntimeChange(runtime.id)}
            onRecheckUpdate={() => catalog.recheckUpdate(runtime.id)}
          />
        );
      })}
      {uninstallTarget && (
        <ConfirmDialog
          title={`Uninstall ${uninstallTarget.displayName}?`}
          message={uninstallMessage(uninstallTarget.id)}
          confirmLabel="Uninstall"
          onConfirm={() => handleUninstallConfirm(uninstallTarget)}
          onCancel={() => setUninstallTarget(null)}
        />
      )}
    </Flex>
  );
}
