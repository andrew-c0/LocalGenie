import type { RuntimeInfo, RuntimeUpdateInfo } from "../types";

/**
 * What the Settings landing flags on the Runtimes row: no runtime installed at all, otherwise any
 * runtime with an update. Null when nothing needs a look. A list not read yet (null) flags nothing.
 */
export function runtimesWarningOf(
  runtimes: RuntimeInfo[] | null,
  updatesById: Record<string, RuntimeUpdateInfo>,
): string | null {
  if (runtimes?.every((r) => r.installedVersion === null)) {
    return "No runtime installed";
  }
  const anyUpdate = Object.values(updatesById).some((update) => update.updateAvailable);
  return anyUpdate ? "A runtime update is available" : null;
}
