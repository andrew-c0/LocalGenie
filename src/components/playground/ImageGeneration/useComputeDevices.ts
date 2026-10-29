import { useEffect, useState } from "react";
import * as playground from "../../../services/playground";
import { usePlaygroundStore } from "../../../stores/playgroundStore";
import type { PlaygroundDevice } from "../../../types";
import { errorMessage } from "../../../utils/errorMessage";
import type { RuntimeStatus } from "../../../utils/playground";

/** What the Compute field shows and does. */
export interface ComputeControls {
  /** Null until the devices have been read. */
  devices: PlaygroundDevice[] | null;
  /** Why the devices could not be read, or null. */
  error: string | null;
  isRefreshing: boolean;
  /** False while the runtime is not installed or a refresh is running. */
  canRefresh: boolean;
  refresh: () => void;
}

/**
 * The compute devices, read once the runtime is installed and kept in the Playground store. The
 * refresh button re-reads them, for example after the user changes the runtime build.
 */
export function useComputeDevices(runtimeStatus: RuntimeStatus): ComputeControls {
  const devices = usePlaygroundStore((s) => s.devices);
  const setDevices = usePlaygroundStore((s) => s.setDevices);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (runtimeStatus !== "installed" || devices !== null) return;
    let active = true;
    playground
      .listComputeDevices()
      .then((list) => {
        if (!active) return;
        setError(null);
        setDevices(list);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, "Could not read the compute devices."));
      });
    return () => {
      active = false;
    };
  }, [runtimeStatus, devices, setDevices]);

  const refresh = () => {
    setIsRefreshing(true);
    playground
      .listComputeDevices()
      .then((list) => {
        setError(null);
        setDevices(list);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err, "Could not read the compute devices."));
      })
      .finally(() => setIsRefreshing(false));
  };

  return {
    devices,
    error,
    isRefreshing,
    canRefresh: runtimeStatus === "installed" && !isRefreshing,
    refresh,
  };
}
