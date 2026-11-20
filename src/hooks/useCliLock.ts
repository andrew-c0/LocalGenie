import { useModelStore } from "../stores/modelStore";
import { cliActionReason } from "../utils/runtimeGuards";

/**
 * The reason an action that needs the GenieX CLI is off right now, or null when it can run. A component
 * shows the reason as a tooltip or a line, and disables the control while it is set.
 */
export function useCliLock(): string | null {
  const cliInstalled = useModelStore((s) => s.cliInstalled);
  return cliActionReason(cliInstalled);
}
