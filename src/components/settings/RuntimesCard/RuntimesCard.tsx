import { useState } from "react";
import type { RuntimeInfo } from "../../../types";
import { ConfirmDialog } from "../../ui/ConfirmDialog/ConfirmDialog";
import { ErrorBanner } from "../../ui/ErrorBanner/ErrorBanner";
import { Flex } from "../../ui/Flex/Flex";
import { StateBlock } from "../../ui/StateBlock/StateBlock";
import RuntimeCard from "./RuntimeCard/RuntimeCard";
import { useRuntimeCatalog } from "./useRuntimeCatalog";
import { useRuntimeOperations } from "./useRuntimeOperations";

/**
 * Settings > Runtimes: one card per runtime. The list and update checks load when this mounts, which
 * is when the section opens; nothing polls.
 */
export default function RuntimesCard() {
  const catalog = useRuntimeCatalog();
  const operations = useRuntimeOperations(catalog.reload);
  const [uninstallTarget, setUninstallTarget] = useState<RuntimeInfo | null>(null);

  if (catalog.loadError) return <ErrorBanner message={catalog.loadError} />;
  if (!catalog.runtimes) return <StateBlock message="Reading runtimes…" />;

  const { running, progress, failure } = operations;
  const activityFor = (runtimeId: string) =>
    running?.runtimeId === runtimeId ? running.action : null;
  const progressFor = (runtimeId: string) =>
    running?.runtimeId === runtimeId && running.action !== "uninstall" ? progress : null;
  const failureFor = (runtimeId: string) =>
    failure?.runtimeId === runtimeId ? failure.message : null;

  const handleUninstallConfirm = (runtime: RuntimeInfo) => {
    setUninstallTarget(null);
    void operations.uninstall(runtime);
  };

  return (
    <Flex direction="column" gap="m">
      {catalog.runtimes.map((runtime) => {
        const update = catalog.updatesById[runtime.id];
        return (
          <RuntimeCard
            key={runtime.id}
            runtime={runtime}
            update={update}
            isBusy={running !== null}
            activeAction={activityFor(runtime.id)}
            progress={progressFor(runtime.id)}
            failureMessage={failureFor(runtime.id)}
            onInstall={() => void operations.installOrUpdate(runtime, update?.latestVersion)}
            onUninstall={() => setUninstallTarget(runtime)}
          />
        );
      })}
      {uninstallTarget && (
        <ConfirmDialog
          title={`Uninstall ${uninstallTarget.displayName}?`}
          message="The installed files are removed. You can install it again later."
          confirmLabel="Uninstall"
          onConfirm={() => handleUninstallConfirm(uninstallTarget)}
          onCancel={() => setUninstallTarget(null)}
        />
      )}
    </Flex>
  );
}
