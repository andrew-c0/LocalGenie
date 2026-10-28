import { useState } from "react";
import { useTauriEvent } from "../../../hooks";
import * as runtimes from "../../../services/runtimes";
import type { RuntimeInfo, RuntimeInstallProgress } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import { toast } from "../../../utils/toast";

export type RuntimeAction = "install" | "update" | "uninstall";

export interface RuntimeOperation {
  runtimeId: string;
  action: RuntimeAction;
}

export interface RuntimeFailure extends RuntimeOperation {
  message: string;
}

export interface RuntimeOperations {
  /** The one operation running now. Runtimes run one at a time, so every action waits for it. */
  running: RuntimeOperation | null;
  /** Latest progress event. Only meaningful while an install or update is running. */
  progress: RuntimeInstallProgress | null;
  /** The last failed operation, shown until the next one starts. */
  failure: RuntimeFailure | null;
  installOrUpdate: (runtime: RuntimeInfo, version?: string) => Promise<void>;
  uninstall: (runtime: RuntimeInfo) => Promise<void>;
}

const DONE_TITLES: Record<RuntimeAction, string> = {
  install: "Runtime installed",
  update: "Runtime updated",
  uninstall: "Runtime removed",
};

/**
 * Install, update and uninstall one runtime at a time. Failures stay on the card as `failure`; a
 * success raises a toast. `onSettled` runs after every operation so the caller can re-read the list.
 */
export function useRuntimeOperations(onSettled: () => Promise<void>): RuntimeOperations {
  const [running, setRunning] = useState<RuntimeOperation | null>(null);
  const [progress, setProgress] = useState<RuntimeInstallProgress | null>(null);
  const [failure, setFailure] = useState<RuntimeFailure | null>(null);

  useTauriEvent<RuntimeInstallProgress>(runtimes.RUNTIME_PROGRESS_EVENT, (payload) => {
    setProgress(payload);
  });

  const run = async (runtime: RuntimeInfo, action: RuntimeAction, task: () => Promise<unknown>) => {
    const operation: RuntimeOperation = { runtimeId: runtime.id, action };
    setRunning(operation);
    setProgress(null);
    setFailure(null);
    try {
      await task();
      toast.success(DONE_TITLES[action], runtime.displayName);
    } catch (err) {
      setFailure({ ...operation, message: errorMessage(err, "The runtime operation failed.") });
    } finally {
      setRunning(null);
      await onSettled();
    }
  };

  const installOrUpdate = (runtime: RuntimeInfo, version?: string) => {
    const action: RuntimeAction = runtime.installedVersion ? "update" : "install";
    return run(runtime, action, () => runtimes.installRuntime(runtime.id, version));
  };

  const uninstall = (runtime: RuntimeInfo) =>
    run(runtime, "uninstall", () => runtimes.uninstallRuntime(runtime.id));

  return { running, progress, failure, installOrUpdate, uninstall };
}
