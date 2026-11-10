import { useAppUpdate } from "../../../hooks/useAppUpdate";

/**
 * App update side effects with no UI: the start and periodic update checks and the desktop notice for a
 * new version. Mounted by the main layout, so the checks keep running while the user is on any page.
 */
export function AppUpdateRuntime() {
  useAppUpdate();
  return null;
}
