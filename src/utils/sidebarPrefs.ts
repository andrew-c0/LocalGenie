/** Preference key: whether the sidebar is shown as the narrow icon rail. */
export const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed";

/** Expanded until the user collapses it. */
export const SIDEBAR_COLLAPSED_DEFAULT = false;

/** The collapsed flag from the stored value. Anything that is not a boolean (missing, text, a number) counts as the default. */
export function resolveSidebarCollapsed(stored: unknown): boolean {
  return typeof stored === "boolean" ? stored : SIDEBAR_COLLAPSED_DEFAULT;
}
