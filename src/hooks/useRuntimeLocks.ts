import { useMemo } from "react";
import { useModelStore } from "../stores/modelStore";
import { installedRuntimeIds, useRuntimeStore } from "../stores/runtimeStore";
import { lockedReason, type RuntimeNeed } from "../utils/runtimeGuards";

/** Returns a function giving the tooltip for an area locked by a missing runtime, or null when it is open. */
export function useRuntimeLocks(): (need: RuntimeNeed) => string | null {
  const cliInstalled = useModelStore((s) => s.cliInstalled);
  const runtimes = useRuntimeStore((s) => s.runtimes);
  const runtimeIds = useMemo(() => installedRuntimeIds(runtimes), [runtimes]);
  return (need) => lockedReason(need, { cliInstalled, runtimeIds });
}
