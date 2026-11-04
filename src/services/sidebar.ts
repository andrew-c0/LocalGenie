import { resolveSidebarCollapsed, SIDEBAR_COLLAPSED_KEY } from "../utils/sidebarPrefs";
import * as db from "./database";

/** The saved sidebar state. Expanded when nothing valid is stored. */
export async function getSidebarCollapsed(): Promise<boolean> {
  const stored = await db.getPreference<boolean>(SIDEBAR_COLLAPSED_KEY).catch(() => null);
  return resolveSidebarCollapsed(stored);
}

/** Saves whether the sidebar is collapsed to the icon rail. */
export async function saveSidebarCollapsed(collapsed: boolean): Promise<void> {
  await db.setPreference(SIDEBAR_COLLAPSED_KEY, collapsed, "boolean");
}
